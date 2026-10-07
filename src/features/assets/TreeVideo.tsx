import { useEffect, useRef, useState } from 'react';
import { MoneyTree } from './MoneyTree';

/** Background colour of the video frames, so the player blends into the card. */
export const TREE_VIDEO_BG = '#f4f1e9';

// Moments in tree-growth.mp4 (18 s): a seed until ~2.8 s, fully grown by ~11.5 s, then gently settling.
const SEED_AT = 0;
const SPROUT_AT = 2.8;
const GROWN_AT = 11.5;
/** How long the grow-up animation should take on screen, whatever the target. */
const ANIMATION_SECONDS = 2.5;

/** Video time showing a tree at `progress` (savings ÷ goal). */
export function videoTimeFor(progress: number, duration: number): number {
  if (!(progress > 0)) return SEED_AT;
  if (progress >= 1) return Math.max(0, duration - 0.05);
  return SPROUT_AT + progress * (GROWN_AT - SPROUT_AT);
}

/**
 * The money tree as video: on load it grows from the seed up to the frame matching the
 * current progress and holds there. Falls back to the drawn tree if the video can't play.
 */
export function TreeVideo({ progress }: { progress: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || failed) return;
    let frame = 0;
    let cancelled = false;

    const run = () => {
      if (cancelled || !Number.isFinite(video.duration)) return;
      const target = videoTimeFor(progress, video.duration);
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // Shrinking (progress went down) or reduced motion: jump straight to the frame.
      if (reduceMotion || target <= video.currentTime + 0.05) {
        video.pause();
        video.currentTime = target;
        return;
      }
      video.playbackRate = Math.min(16, Math.max(1, (target - video.currentTime) / ANIMATION_SECONDS));
      const stopAtTarget = () => {
        if (cancelled) return;
        if (video.currentTime >= target || video.ended) {
          video.pause();
          video.currentTime = target;
          return;
        }
        frame = requestAnimationFrame(stopAtTarget);
      };
      video.play().then(
        () => (frame = requestAnimationFrame(stopAtTarget)),
        () => {
          // Autoplay blocked: show the target frame without animating.
          video.currentTime = target;
        },
      );
    };

    if (video.readyState >= 1) run();
    else video.addEventListener('loadedmetadata', run, { once: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      video.removeEventListener('loadedmetadata', run);
    };
  }, [progress, failed]);

  if (failed) return <MoneyTree progress={progress} />;

  return (
    <video
      ref={ref}
      className="aspect-square w-full rounded-xl"
      style={{ background: TREE_VIDEO_BG }}
      poster="/tree/tree-start.webp"
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-label={`ต้นไม้เงินโตแล้ว ${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`}
      onError={() => setFailed(true)}
    >
      <source src="/tree/tree-growth.webm" type="video/webm" />
      {/* The last source failing means no format could play. */}
      <source src="/tree/tree-growth.mp4" type="video/mp4" onError={() => setFailed(true)} />
    </video>
  );
}
