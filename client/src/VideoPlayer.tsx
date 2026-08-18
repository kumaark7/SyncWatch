import { useEffect, useRef } from "react";
import { socket, API_URL } from "./socket";

type Props = {
  roomId: string;
  hasFile: boolean;
};

export default function VideoPlayer({ roomId, hasFile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const applyingRemote = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const withRemoteGuard = async (fn: () => void | Promise<void>) => {
      applyingRemote.current = true;
      try {
        await fn();
      } finally {
        window.setTimeout(() => {
          applyingRemote.current = false;
        }, 100);
      }
    };

    const onRemotePlay = ({ time }: { time: number }) => {
      void withRemoteGuard(async () => {
        if (Math.abs(video.currentTime - time) > 0.4) {
          video.currentTime = time;
        }
        try {
          await video.play();
        } catch {
          // Browser autoplay policy can require one user interaction.
        }
      });
    };

    const onRemotePause = ({ time }: { time: number }) => {
      void withRemoteGuard(() => {
        video.currentTime = time;
        video.pause();
      });
    };

    const onRemoteSeek = ({
      time,
      playing
    }: {
      time: number;
      playing: boolean;
    }) => {
      void withRemoteGuard(async () => {
        video.currentTime = time;
        if (playing) {
          try {
            await video.play();
          } catch {}
        } else {
          video.pause();
        }
      });
    };

    const onRemoteSync = ({
      time,
      playing
    }: {
      time: number;
      playing: boolean;
    }) => {
      void withRemoteGuard(async () => {
        const drift = time - video.currentTime;

        if (Math.abs(drift) > 0.75) {
          video.currentTime = time;
        }

        if (playing && video.paused) {
          try {
            await video.play();
          } catch {}
        } else if (!playing && !video.paused) {
          video.pause();
        }
      });
    };

    socket.on("play", onRemotePlay);
    socket.on("pause", onRemotePause);
    socket.on("seek", onRemoteSeek);
    socket.on("sync", onRemoteSync);

    const syncTimer = window.setInterval(() => {
      if (!video.paused && !video.ended) {
        socket.emit("sync", {
          roomId,
          time: video.currentTime,
          playing: true
        });
      }
    }, 5000);

    return () => {
      window.clearInterval(syncTimer);
      socket.off("play", onRemotePlay);
      socket.off("pause", onRemotePause);
      socket.off("seek", onRemoteSeek);
      socket.off("sync", onRemoteSync);
    };
  }, [roomId]);

  if (!hasFile) {
    return <div className="videoPlaceholder">Choose a video to start.</div>;
  }

  return (
    <video
      key={roomId}
      ref={videoRef}
      className="video"
      src={`${API_URL}/api/stream/${roomId}`}
      controls
      playsInline
      onPlay={(e) => {
        if (applyingRemote.current) return;
        socket.emit("play", {
          roomId,
          time: e.currentTarget.currentTime
        });
      }}
      onPause={(e) => {
        if (applyingRemote.current || e.currentTarget.ended) return;
        socket.emit("pause", {
          roomId,
          time: e.currentTarget.currentTime
        });
      }}
      onSeeked={(e) => {
        if (applyingRemote.current) return;
        socket.emit("seek", {
          roomId,
          time: e.currentTarget.currentTime,
          playing: !e.currentTarget.paused
        });
      }}
    />
  );
}
