import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RoomEventCallbacks
} from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  loadCallInputDevices,
  saveCallInputDevices,
  selectCallInputDevice,
  type CallInputDeviceKind
} from "./callDevices";
import { requestCallToken } from "./livekitApi";
import {
  claimScreenShare,
  releaseScreenShare,
  setGuestScreenSharing
} from "./screenShareApi";
import {
  createAudioCaptureOptions,
  createVideoCaptureOptions,
  getSupportedAudioProcessing,
  loadCallQualitySettings,
  saveCallQualitySettings
} from "./callQuality";
import type {
  AudioProcessingSetting,
  CallQualitySettings,
  CallStatus,
  VideoQualityMode
} from "./types";

type CallContextValue = {
  status: CallStatus;
  participantCount: number;
  error: string | null;
  mutedRemoteParticipantIds: ReadonlySet<string>;
  listenersWhoMutedMe: ReadonlyMap<string, string>;
  qualitySettings: CallQualitySettings;
  supportedAudioProcessing: Readonly<Record<AudioProcessingSetting, boolean>>;
  adaptiveStreamEnabled: true;
  adaptiveStreamRuntimeConfigurable: false;
  isScreenSharing: boolean;
  guestScreenSharingAllowed: boolean;
  screenShareBlocked: boolean;
  canManageGuestScreenSharing: boolean;
  joinCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setGuestScreenSharingAllowed: (allowed: boolean) => Promise<void>;
  setAudioProcessing: (
    setting: AudioProcessingSetting,
    enabled: boolean
  ) => Promise<void>;
  setVideoQuality: (quality: VideoQualityMode) => Promise<void>;
  switchInputDevice: (
    kind: "audioinput" | "videoinput",
    deviceId: string
  ) => Promise<void>;
  toggleRemoteAudio: (participantIdentity: string) => Promise<void>;
  clearError: () => void;
};

const SPEAKER_MUTE_TOPIC = "syncwatch-speaker-mute";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type SpeakerMuteSignal = {
  type: "SPEAKER_MUTE";
  muted: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

type Props = {
  roomId: string;
  clientId: string;
  onCallJoined?: () => void;
  onCallLeft?: () => void;
  isHost: boolean;
  isGuest: boolean;
  guestScreenSharingAllowed: boolean;
  screenSharerClientId: string | null;
  authenticatedFetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  onScreenShareStarted: () => void;
  children: ReactNode;
};

export default function CallProvider({
  roomId,
  clientId,
  onCallJoined,
  onCallLeft,
  isHost,
  isGuest,
  guestScreenSharingAllowed,
  screenSharerClientId,
  authenticatedFetch,
  onScreenShareStarted,
  children
}: Props) {
  const [qualitySettings, setQualitySettings] = useState(loadCallQualitySettings);
  const [supportedAudioProcessing] = useState(getSupportedAudioProcessing);
  const preferredInputDevicesRef = useRef(loadCallInputDevices());
  const [room] = useState(() => new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: createAudioCaptureOptions(
      qualitySettings,
      supportedAudioProcessing,
      preferredInputDevicesRef.current.audioinput
    ),
    videoCaptureDefaults: createVideoCaptureOptions(
      qualitySettings.videoQuality,
      preferredInputDevicesRef.current.videoinput
    )
  }));
  const [status, setStatus] = useState<CallStatus>("idle");
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mutedRemoteParticipantIds, setMutedRemoteParticipantIds] =
    useState<Set<string>>(() => new Set());
  const mutedRemoteParticipantIdsRef = useRef(mutedRemoteParticipantIds);
  const screenSharerClientIdRef = useRef(screenSharerClientId);
  const [listenersWhoMutedMe, setListenersWhoMutedMe] =
    useState<Map<string, string>>(() => new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const releaseScreenShareLease = useCallback((keepalive = false) => {
    return releaseScreenShare(
      authenticatedFetch,
      roomId,
      clientId,
      keepalive
    );
  }, [authenticatedFetch, clientId, roomId]);

  const publishSpeakerMute = useCallback(async (
    participantIdentity: string,
    muted: boolean
  ) => {
    const signal: SpeakerMuteSignal = {
      type: "SPEAKER_MUTE",
      muted
    };

    await room.localParticipant.publishData(
      textEncoder.encode(JSON.stringify(signal)),
      {
        reliable: true,
        topic: SPEAKER_MUTE_TOPIC,
        destinationIdentities: [participantIdentity]
      }
    );
  }, [room]);

  useEffect(() => {
    mutedRemoteParticipantIdsRef.current = mutedRemoteParticipantIds;
  }, [mutedRemoteParticipantIds]);

  useEffect(() => {
    screenSharerClientIdRef.current = screenSharerClientId;
    const expectedIdentity = screenSharerClientId
      ? `syncwatch:${roomId}:${screenSharerClientId}`
      : null;
    for (const participant of room.remoteParticipants.values()) {
      const subscribed = participant.identity === expectedIdentity;
      participant.getTrackPublication(Track.Source.ScreenShare)?.setSubscribed(subscribed);
      participant.getTrackPublication(Track.Source.ScreenShareAudio)?.setSubscribed(subscribed);
    }
  }, [room, roomId, screenSharerClientId]);

  const ensureInputDevice = useCallback(async (
    kind: CallInputDeviceKind,
    requestPermissions: boolean
  ) => {
    const devices = await Room.getLocalDevices(kind, requestPermissions);
    const selected = selectCallInputDevice(
      devices,
      preferredInputDevicesRef.current[kind],
      room.getActiveDevice(kind)
    );

    if (!selected?.deviceId) {
      if (requestPermissions) {
        throw new Error(`No ${kind === "videoinput" ? "camera" : "microphone"} is available`);
      }
      return undefined;
    }

    if (room.getActiveDevice(kind) !== selected.deviceId) {
      const switched = await room.switchActiveDevice(kind, selected.deviceId);
      if (!switched) {
        throw new Error(`Could not select ${kind}`);
      }
    }

    preferredInputDevicesRef.current = {
      ...preferredInputDevicesRef.current,
      [kind]: selected.deviceId
    };
    saveCallInputDevices(preferredInputDevicesRef.current);
    return selected.deviceId;
  }, [room]);

  useEffect(() => {
    void Promise.allSettled([
      ensureInputDevice("audioinput", false),
      ensureInputDevice("videoinput", false)
    ]);
  }, [ensureInputDevice]);

  useEffect(() => {
    const updateParticipantCount = () => {
      setParticipantCount(
        room.state === ConnectionState.Connected
          || room.state === ConnectionState.Reconnecting
          ? room.remoteParticipants.size + 1
          : 0
      );
    };

    const handleTrackPublished: RoomEventCallbacks["trackPublished"] = (
      publication,
      participant
    ) => {
      if (
        publication.source === Track.Source.ScreenShare
        || publication.source === Track.Source.ScreenShareAudio
      ) {
        const expectedIdentity = screenSharerClientIdRef.current
          ? `syncwatch:${roomId}:${screenSharerClientIdRef.current}`
          : null;
        publication.setSubscribed(participant.identity === expectedIdentity);
        return;
      }
      if (
        publication.source === Track.Source.Microphone &&
        mutedRemoteParticipantIdsRef.current.has(participant.identity)
      ) {
        publication.setSubscribed(false);
      }
    };

    const handleParticipantConnected: RoomEventCallbacks["participantConnected"] = (
      participant
    ) => {
      updateParticipantCount();

      if (mutedRemoteParticipantIdsRef.current.has(participant.identity)) {
        participant
          .getTrackPublication(Track.Source.Microphone)
          ?.setSubscribed(false);
        void publishSpeakerMute(participant.identity, true).catch(() => {
          setError("Speaker status could not be shared with the participant");
        });
      }
    };

    const handleParticipantDisconnected: RoomEventCallbacks["participantDisconnected"] = (
      participant
    ) => {
      updateParticipantCount();
      setMutedRemoteParticipantIds((current) => {
        const next = new Set(current);
        next.delete(participant.identity);
        return next;
      });
      setListenersWhoMutedMe((current) => {
        const next = new Map(current);
        next.delete(participant.identity);
        return next;
      });
    };

    const handleDataReceived: RoomEventCallbacks["dataReceived"] = (
      payload,
      participant,
      _kind,
      topic
    ) => {
      if (topic !== SPEAKER_MUTE_TOPIC || !participant) {
        return;
      }

      try {
        const signal: unknown = JSON.parse(textDecoder.decode(payload));
        if (
          typeof signal !== "object" ||
          signal === null ||
          !("type" in signal) ||
          !("muted" in signal) ||
          signal.type !== "SPEAKER_MUTE" ||
          typeof signal.muted !== "boolean"
        ) {
          return;
        }

        setListenersWhoMutedMe((current) => {
          const next = new Map(current);
          if (signal.muted) {
            next.set(
              participant.identity,
              participant.name?.trim() || "A participant"
            );
          } else {
            next.delete(participant.identity);
          }
          return next;
        });
      } catch {
        // Ignore unrelated or malformed participant data.
      }
    };

    const handleLocalTrackPublished: RoomEventCallbacks["localTrackPublished"] = (
      publication
    ) => {
      if (publication.source === Track.Source.ScreenShare) {
        setIsScreenSharing(true);
      }
    };

    const handleLocalTrackUnpublished: RoomEventCallbacks["localTrackUnpublished"] = (
      publication
    ) => {
      if (publication.source === Track.Source.ScreenShare) {
        setIsScreenSharing(false);
        void releaseScreenShareLease().catch(() => undefined);
      }
    };

    const handleConnectionState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        setStatus("connected");
      } else if (state === ConnectionState.Reconnecting) {
        setStatus("reconnecting");
      } else if (state === ConnectionState.Connecting) {
        setStatus("connecting");
      } else {
        setStatus("idle");
        if (room.localParticipant.isScreenShareEnabled) {
          setIsScreenSharing(false);
          void releaseScreenShareLease(true).catch(() => undefined);
        }
      }
      updateParticipantCount();
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionState);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionState);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
      room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
      if (room.localParticipant.isScreenShareEnabled) {
        void releaseScreenShareLease(true).catch(() => undefined);
      }
      void room.disconnect(true);
    };
  }, [publishSpeakerMute, releaseScreenShareLease, room, roomId]);

  useEffect(() => {
    if (room.state !== ConnectionState.Disconnected) {
      void room.disconnect(true);
    }
    setStatus("idle");
    setParticipantCount(0);
    setError(null);
    setMutedRemoteParticipantIds(new Set());
    setListenersWhoMutedMe(new Map());
    setIsScreenSharing(false);
  }, [room, roomId, clientId]);

  const joinCall = useCallback(async () => {
    if (!roomId || !clientId || room.state !== ConnectionState.Disconnected) {
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      const credentials = await requestCallToken(roomId, clientId);
      await room.connect(credentials.serverUrl, credentials.token, {
        autoSubscribe: true
      });
      setStatus("connected");
      setParticipantCount(room.remoteParticipants.size + 1);
      onCallJoined?.();
    } catch (cause) {
      await room.disconnect(true);
      setStatus("idle");
      setParticipantCount(0);
      setError(cause instanceof Error ? cause.message : "Could not join room call");
    }
  }, [clientId, onCallJoined, room, roomId]);

  const applyAudioProcessing = useCallback(async (
    settings: CallQualitySettings = qualitySettings
  ) => {
    const audioTrack = room.localParticipant
      .getTrackPublication(Track.Source.Microphone)
      ?.audioTrack;
    if (!audioTrack) {
      return;
    }

    await audioTrack.applyConstraints(
      createAudioCaptureOptions(settings, supportedAudioProcessing)
    );
  }, [qualitySettings, room, supportedAudioProcessing]);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    setError(null);
    if (!enabled) {
      await room.localParticipant.setMicrophoneEnabled(false);
      return;
    }

    const deviceId = await ensureInputDevice("audioinput", true);
    const options = createAudioCaptureOptions(
      qualitySettings,
      supportedAudioProcessing,
      deviceId
    );
    await room.localParticipant.setMicrophoneEnabled(true, options);
    try {
      await applyAudioProcessing();
    } catch {
      setError("Some microphone processing options are not supported by this browser");
    }
  }, [applyAudioProcessing, ensureInputDevice, qualitySettings, room, supportedAudioProcessing]);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    setError(null);
    if (!enabled) {
      await room.localParticipant.setCameraEnabled(false);
      return;
    }

    const deviceId = await ensureInputDevice("videoinput", true);
    const options = createVideoCaptureOptions(
      qualitySettings.videoQuality,
      deviceId
    );
    const existingTrack = room.localParticipant
      .getTrackPublication(Track.Source.Camera)
      ?.videoTrack;
    if (existingTrack) {
      await existingTrack.restartTrack(options);
      await room.localParticipant.setCameraEnabled(true);
    } else {
      await room.localParticipant.setCameraEnabled(true, options);
    }
  }, [ensureInputDevice, qualitySettings.videoQuality, room]);

  const stopScreenSharing = useCallback(async () => {
    setError(null);
    try {
      await room.localParticipant.setScreenShareEnabled(false);
    } finally {
      setIsScreenSharing(false);
      await releaseScreenShareLease().catch(() => undefined);
    }
  }, [releaseScreenShareLease, room]);

  const toggleScreenShare = useCallback(async () => {
    if (room.localParticipant.isScreenShareEnabled) {
      await stopScreenSharing();
      return;
    }
    setError(null);
    await claimScreenShare(authenticatedFetch, roomId, clientId);
    try {
      const publication = await room.localParticipant.setScreenShareEnabled(true, {
        audio: true,
        video: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        systemAudio: "include"
      });
      if (!publication) {
        throw new Error("Screen sharing did not start");
      }
      setIsScreenSharing(true);
      onScreenShareStarted();
    } catch (cause) {
      await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
      await releaseScreenShareLease().catch(() => undefined);
      const message = cause instanceof Error
        ? cause.message
        : "Screen sharing permission was not available";
      setError(message);
      throw cause;
    }
  }, [
    authenticatedFetch,
    clientId,
    onScreenShareStarted,
    releaseScreenShareLease,
    room,
    roomId,
    stopScreenSharing
  ]);

  const updateGuestScreenSharing = useCallback(async (allowed: boolean) => {
    setError(null);
    try {
      await setGuestScreenSharing(
        authenticatedFetch,
        roomId,
        clientId,
        allowed
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Screen sharing access could not be updated");
    }
  }, [authenticatedFetch, clientId, roomId]);

  useEffect(() => {
    if (
      isGuest
      && !isHost
      && !guestScreenSharingAllowed
      && room.localParticipant.isScreenShareEnabled
    ) {
      void stopScreenSharing();
    }
  }, [guestScreenSharingAllowed, isGuest, isHost, room, stopScreenSharing]);

  const setAudioProcessing = useCallback(async (
    setting: AudioProcessingSetting,
    enabled: boolean
  ) => {
    const nextSettings: CallQualitySettings = {
      ...qualitySettings,
      audio: {
        ...qualitySettings.audio,
        [setting]: enabled
      }
    };
    setQualitySettings(nextSettings);
    saveCallQualitySettings(nextSettings);
    room.options.audioCaptureDefaults = {
      ...room.options.audioCaptureDefaults,
      ...createAudioCaptureOptions(nextSettings, supportedAudioProcessing)
    };

    try {
      await applyAudioProcessing(nextSettings);
      setError(null);
    } catch {
      setError("That microphone processing option is not supported by this browser");
    }
  }, [applyAudioProcessing, qualitySettings, room, supportedAudioProcessing]);

  const setVideoQuality = useCallback(async (quality: VideoQualityMode) => {
    const nextSettings: CallQualitySettings = {
      ...qualitySettings,
      videoQuality: quality
    };
    setQualitySettings(nextSettings);
    saveCallQualitySettings(nextSettings);
    const options = createVideoCaptureOptions(
      quality,
      room.getActiveDevice("videoinput")
    );
    room.options.videoCaptureDefaults = {
      ...room.options.videoCaptureDefaults,
      ...options
    };

    const cameraPublication = room.localParticipant.getTrackPublication(
      Track.Source.Camera
    );
    if (cameraPublication?.videoTrack && !cameraPublication.isMuted) {
      try {
        await cameraPublication.videoTrack.restartTrack(options);
        setError(null);
      } catch {
        setError("The camera could not apply that quality; it may not support the requested size");
      }
    }
  }, [qualitySettings, room]);

  const switchInputDevice = useCallback(async (
    kind: "audioinput" | "videoinput",
    deviceId: string
  ) => {
    const switched = await room.switchActiveDevice(kind, deviceId);
    if (!switched) {
      throw new Error(`Could not switch ${kind}`);
    }

    preferredInputDevicesRef.current = {
      ...preferredInputDevicesRef.current,
      [kind]: deviceId
    };
    saveCallInputDevices(preferredInputDevicesRef.current);

    if (kind === "audioinput") {
      await applyAudioProcessing().catch(() => {
        setError("Microphone switched, but some processing options were unavailable");
      });
      return;
    }

    // LiveKit preserves an active track's current constraints during a device
    // switch, so the selected quality remains intact without a second restart.
  }, [applyAudioProcessing, room]);

  const leaveCall = useCallback(async () => {
    const wasJoined = room.state === ConnectionState.Connected
      || room.state === ConnectionState.Reconnecting;
    setError(null);
    if (room.localParticipant.isScreenShareEnabled) {
      await stopScreenSharing().catch(() => undefined);
    }
    await room.localParticipant.setCameraEnabled(false).catch(() => undefined);
    await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await room.disconnect(true);
    setStatus("idle");
    setParticipantCount(0);
    setMutedRemoteParticipantIds(new Set());
    setListenersWhoMutedMe(new Map());
    if (wasJoined) {
      onCallLeft?.();
    }
  }, [onCallLeft, room, stopScreenSharing]);

  const toggleRemoteAudio = useCallback(async (participantIdentity: string) => {
    const participant = room.remoteParticipants.get(participantIdentity);
    if (!participant) {
      return;
    }

    const muted = !mutedRemoteParticipantIds.has(participantIdentity);
    const microphonePublication = participant.getTrackPublication(
      Track.Source.Microphone
    );
    microphonePublication?.setSubscribed(!muted);

    setMutedRemoteParticipantIds((current) => {
      const next = new Set(current);
      if (muted) {
        next.add(participantIdentity);
      } else {
        next.delete(participantIdentity);
      }
      return next;
    });

    try {
      await publishSpeakerMute(participantIdentity, muted);
    } catch {
      microphonePublication?.setSubscribed(muted);
      setMutedRemoteParticipantIds((current) => {
        const next = new Set(current);
        if (muted) {
          next.delete(participantIdentity);
        } else {
          next.add(participantIdentity);
        }
        return next;
      });
      setError("Speaker status could not be shared with the participant");
    }
  }, [mutedRemoteParticipantIds, publishSpeakerMute, room]);

  const value = useMemo<CallContextValue>(() => ({
    status,
    participantCount,
    error,
    mutedRemoteParticipantIds,
    listenersWhoMutedMe,
    qualitySettings,
    supportedAudioProcessing,
    adaptiveStreamEnabled: true,
    adaptiveStreamRuntimeConfigurable: false,
    isScreenSharing,
    guestScreenSharingAllowed,
    screenShareBlocked: isGuest && !isHost && !guestScreenSharingAllowed,
    canManageGuestScreenSharing: isHost,
    joinCall,
    leaveCall,
    setMicrophoneEnabled,
    setCameraEnabled,
    toggleScreenShare,
    setGuestScreenSharingAllowed: updateGuestScreenSharing,
    setAudioProcessing,
    setVideoQuality,
    switchInputDevice,
    toggleRemoteAudio,
    clearError: () => setError(null)
  }), [
    error,
    guestScreenSharingAllowed,
    isGuest,
    isHost,
    isScreenSharing,
    joinCall,
    leaveCall,
    listenersWhoMutedMe,
    mutedRemoteParticipantIds,
    participantCount,
    qualitySettings,
    setAudioProcessing,
    setCameraEnabled,
    setMicrophoneEnabled,
    setVideoQuality,
    status,
    supportedAudioProcessing,
    switchInputDevice,
    toggleScreenShare,
    toggleRemoteAudio,
    updateGuestScreenSharing
  ]);

  return (
    <RoomContext.Provider value={room}>
      <CallContext.Provider value={value}>
        {children}
        {status !== "idle" && <RoomAudioRenderer />}
      </CallContext.Provider>
    </RoomContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used inside CallProvider");
  }
  return context;
}
