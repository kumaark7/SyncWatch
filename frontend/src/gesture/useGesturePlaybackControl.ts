import { useRoomContext } from "@livekit/components-react";
import {
  RoomEvent,
  Track,
  type RoomEventCallbacks
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import type { GestureRecognizer } from "@mediapipe/tasks-vision";

export type GesturePlaybackAction = "play" | "pause";
export type GestureControlStatus =
  | "off"
  | "waiting-camera"
  | "loading"
  | "ready"
  | "error";

type Options = {
  enabled: boolean;
  onAction: (action: GesturePlaybackAction) => void;
};

const HOLD_MS = 600;
const COOLDOWN_MS = 1500;
const DETECTION_INTERVAL_MS = 150;
const TASKS_VISION_VERSION = "1.0.1";
const WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

type SupportedGesture = "Open_Palm" | "Thumb_Up";

function gestureToAction(
  gesture: SupportedGesture
): GesturePlaybackAction {
  return gesture === "Open_Palm" ? "pause" : "play";
}

export default function useGesturePlaybackControl({
  enabled,
  onAction
}: Options) {
  const room = useRoomContext();
  const [cameraTrack, setCameraTrack] =
    useState<MediaStreamTrack | null>(null);
  const [status, setStatus] =
    useState<GestureControlStatus>("off");
  const [lastAction, setLastAction] =
    useState<GesturePlaybackAction | null>(null);

  const onActionRef = useRef(onAction);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const recognizerPromiseRef =
    useRef<Promise<GestureRecognizer> | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    const refreshCameraTrack = () => {
      const publication = room.localParticipant.getTrackPublication(
        Track.Source.Camera
      );
      const track = publication?.track?.mediaStreamTrack ?? null;
      const usableTrack =
        publication &&
        !publication.isMuted &&
        track?.readyState === "live" &&
        track.enabled
          ? track
          : null;

      setCameraTrack((current) =>
        current === usableTrack ? current : usableTrack
      );
    };

    const handleLocalTrackChange: RoomEventCallbacks["localTrackPublished"] =
      () => refreshCameraTrack();
    const handleLocalTrackUnpublished: RoomEventCallbacks["localTrackUnpublished"] =
      () => refreshCameraTrack();
    const handleTrackMuted: RoomEventCallbacks["trackMuted"] =
      (_publication, participant) => {
        if (participant === room.localParticipant) {
          refreshCameraTrack();
        }
      };
    const handleTrackUnmuted: RoomEventCallbacks["trackUnmuted"] =
      (_publication, participant) => {
        if (participant === room.localParticipant) {
          refreshCameraTrack();
        }
      };

    refreshCameraTrack();
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackChange);
    room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
    room.on(RoomEvent.TrackMuted, handleTrackMuted);
    room.on(RoomEvent.TrackUnmuted, handleTrackUnmuted);

    return () => {
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackChange);
      room.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
      room.off(RoomEvent.TrackMuted, handleTrackMuted);
      room.off(RoomEvent.TrackUnmuted, handleTrackUnmuted);
    };
  }, [room]);

  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      recognizerRef.current?.close();
      recognizerRef.current = null;
      recognizerPromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setLastAction(null);
      return;
    }

    if (!cameraTrack) {
      setStatus("waiting-camera");
      setLastAction(null);
      return;
    }

    let cancelled = false;
    let frameId: number | null = null;
    let lastDetectionAt = 0;
    let cooldownUntil = 0;
    let heldGesture: SupportedGesture | null = null;
    let heldSince = 0;
    let lockedGesture: SupportedGesture | null = null;

    const cameraVideo = document.createElement("video");
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
    cameraVideo.srcObject = new MediaStream([cameraTrack]);

    const ensureRecognizer = async () => {
      if (recognizerRef.current) {
        return recognizerRef.current;
      }

      if (!recognizerPromiseRef.current) {
        recognizerPromiseRef.current = import("@mediapipe/tasks-vision")
          .then(async ({ FilesetResolver, GestureRecognizer }) => {
            const vision = await FilesetResolver.forVisionTasks(WASM_URL);
            return GestureRecognizer.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "CPU"
              },
              runningMode: "VIDEO",
              numHands: 1,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
              cannedGesturesClassifierOptions: {
                scoreThreshold: 0.65,
                categoryAllowlist: ["Open_Palm", "Thumb_Up"]
              }
            });
          })
          .then((recognizer) => {
            if (disposedRef.current) {
              recognizer.close();
              throw new Error("Gesture control was disposed");
            }

            recognizerRef.current = recognizer;
            return recognizer;
          })
          .catch((error) => {
            recognizerPromiseRef.current = null;
            throw error;
          });
      }

      return recognizerPromiseRef.current;
    };

    const processGesture = (
      gesture: SupportedGesture | null,
      timestamp: number
    ) => {
      if (!gesture) {
        heldGesture = null;
        heldSince = 0;
        lockedGesture = null;
        return;
      }

      if (lockedGesture === gesture) {
        return;
      }

      if (heldGesture !== gesture) {
        heldGesture = gesture;
        heldSince = timestamp;
        lockedGesture = null;
        return;
      }

      if (
        timestamp - heldSince < HOLD_MS ||
        timestamp < cooldownUntil
      ) {
        return;
      }

      const action = gestureToAction(gesture);
      lockedGesture = gesture;
      cooldownUntil = timestamp + COOLDOWN_MS;
      heldGesture = null;
      heldSince = 0;
      setLastAction(action);
      onActionRef.current(action);
    };

    const detect = (
      recognizer: GestureRecognizer,
      timestamp: number
    ) => {
      if (
        cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        cameraVideo.videoWidth === 0 ||
        timestamp - lastDetectionAt < DETECTION_INTERVAL_MS
      ) {
        return;
      }

      lastDetectionAt = timestamp;
      const result = recognizer.recognizeForVideo(cameraVideo, timestamp);
      const categoryName = result.gestures[0]?.[0]?.categoryName;
      const gesture =
        categoryName === "Open_Palm" || categoryName === "Thumb_Up"
          ? categoryName
          : null;

      processGesture(gesture, timestamp);
    };

    const start = async () => {
      setStatus("loading");

      try {
        await cameraVideo.play();
        const recognizer = await ensureRecognizer();

        if (cancelled) {
          return;
        }

        setStatus("ready");

        const loop = (timestamp: number) => {
          if (cancelled) {
            return;
          }

          try {
            detect(recognizer, timestamp);
          } catch (error) {
            console.warn("Gesture recognition paused after an error.", error);
            setStatus("error");
            return;
          }

          frameId = window.requestAnimationFrame(loop);
        };

        frameId = window.requestAnimationFrame(loop);
      } catch (error) {
        if (!cancelled) {
          console.warn("Could not start gesture control.", error);
          setStatus("error");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      cameraVideo.pause();
      cameraVideo.srcObject = null;
    };
  }, [cameraTrack, enabled]);

  return {
    cameraAvailable: cameraTrack !== null,
    status,
    lastAction
  };
}
