import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { getTutorialDefinition } from "./tutorial-definitions";
import { PrimitivePortal } from "./primitives/primitive-portal";
import { Tooltip } from "./primitives/tooltip";

type TutorialOverlayProps = {
  tutorialId?: string;
  stepIndex: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
};

type RectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  startedAt: number;
};

const BOUNCE_CLASS = "tutorial-target-bounce";

export function TutorialOverlay(props: TutorialOverlayProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let animationFrame = 0;
  let retryTimer: number | undefined;
  const [targetRect, setTargetRect] = createSignal<RectSnapshot>();
  const [targetPresent, setTargetPresent] = createSignal(false);
  const [stepStartedAt, setStepStartedAt] = createSignal(Date.now());
  const [particles, setParticles] = createSignal<Particle[]>([]);
  const tutorial = createMemo(() => getTutorialDefinition(props.tutorialId));
  const currentStep = createMemo(() => tutorial()?.steps[props.stepIndex]);

  const syncTarget = () => {
    const step = currentStep();
    if (!step) {
      setTargetPresent(false);
      setTargetRect(undefined);
      return;
    }

    const element = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
    if (!element) {
      setTargetPresent(false);
      setTargetRect(undefined);
      return;
    }

    const rect = element.getBoundingClientRect();
    setTargetPresent(true);
    setTargetRect({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    });
  };

  createEffect(() => {
    props.tutorialId;
    props.stepIndex;
    setParticles([]);
    setStepStartedAt(Date.now());
    cleanupBounceClass();
    syncTarget();

    if (retryTimer !== undefined) {
      window.clearInterval(retryTimer);
    }

    retryTimer = window.setInterval(syncTarget, 250);
    onCleanup(() => {
      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer);
      }
      cleanupBounceClass();
    });
  });

  createEffect(() => {
    const step = currentStep();
    if (!step || !targetPresent()) {
      return;
    }

    const elapsed = Date.now() - stepStartedAt();
    if (elapsed < 1000 || particles().length > 0) {
      return;
    }

    const rect = targetRect();
    if (!rect) {
      return;
    }

    setParticles(createBurstParticles(rect));
    const target = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
    target?.classList.add(BOUNCE_CLASS);
    window.setTimeout(() => target?.classList.remove(BOUNCE_CLASS), 750);
  });

  createEffect(() => {
    if (!props.tutorialId) {
      return;
    }

    const render = () => {
      drawOverlay(canvasRef, targetRect(), targetPresent(), particles());
      setParticles((current) => current.filter((particle) => Date.now() - particle.startedAt < particle.lifeMs));
      animationFrame = window.requestAnimationFrame(render);
    };

    resizeCanvas(canvasRef);
    render();
    const handleResize = () => {
      resizeCanvas(canvasRef);
      syncTarget();
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", syncTarget, true);
    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", syncTarget, true);
      window.cancelAnimationFrame(animationFrame);
    });
  });

  const content = (
    <Show when={props.tutorialId && currentStep()}>
      <div class="tutorial-overlay-shell">
        <canvas ref={canvasRef} class="tutorial-overlay-canvas" />
        <div class="tutorial-overlay-backdrop" />
        <div class="tutorial-overlay-panel">
          <div class="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-white/70">
            Guided tutorial
          </div>
          <div class="mt-2 text-lg font-semibold text-white">{currentStep()!.title}</div>
          <div class="mt-2 text-sm leading-6 text-white/82">{currentStep()!.body}</div>
          <Show when={!targetPresent()}>
            <div class="mt-3 rounded-2xl border border-white/15 bg-white/10 p-3 text-[0.75rem] leading-6 text-white/78">
              {currentStep()!.fallback}
            </div>
          </Show>
          <div class="mt-4 flex flex-wrap gap-2">
            <Tooltip content={props.stepIndex === 0 ? "Already at the first tutorial step" : "Go to previous tutorial step"}>
              <span class="inline-flex">
                <button
                  class="tutorial-overlay-button tutorial-overlay-button-secondary"
                  type="button"
                  onClick={props.onBack}
                  disabled={props.stepIndex === 0}
                >
                  Back
                </button>
              </span>
            </Tooltip>
            <button class="tutorial-overlay-button" type="button" onClick={props.onNext}>
              {props.stepIndex >= (tutorial()?.steps.length ?? 1) - 1 ? "Finish" : "Next"}
            </button>
            <button class="tutorial-overlay-button tutorial-overlay-button-secondary" type="button" onClick={props.onClose}>
              Skip
            </button>
          </div>
        </div>
      </div>
    </Show>
  );

  return (
    <PrimitivePortal active={Boolean(props.tutorialId && currentStep())} layer="tutorial">
      {content}
    </PrimitivePortal>
  );
}

function resizeCanvas(canvas: HTMLCanvasElement | undefined) {
  if (!canvas) {
    return;
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawOverlay(
  canvas: HTMLCanvasElement | undefined,
  rect: RectSnapshot | undefined,
  targetPresent: boolean,
  particles: Particle[]
) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(0, 0, 0, 0.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (targetPresent && rect) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const radius = Math.max(rect.width, rect.height) * 0.62 + 20;
    const pulse = 1 + Math.sin(Date.now() / 220) * 0.045;

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const gradient = context.createRadialGradient(centerX, centerY, radius * 0.55, centerX, centerY, radius * 1.15);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
    context.stroke();
  }

  for (const particle of particles) {
    const progress = (Date.now() - particle.startedAt) / particle.lifeMs;
    const alpha = Math.max(0, 1 - progress);
    context.fillStyle = `rgba(255, 236, 168, ${alpha})`;
    context.beginPath();
    context.arc(particle.x + particle.vx * progress, particle.y + particle.vy * progress, 2.2, 0, Math.PI * 2);
    context.fill();
  }
}

function createBurstParticles(rect: RectSnapshot) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) * 0.62 + 20;
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;
    const velocity = 36 + (index % 5) * 14;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      lifeMs: 900,
      startedAt: Date.now()
    };
  });
}

function cleanupBounceClass() {
  document.querySelectorAll(`.${BOUNCE_CLASS}`).forEach((element) => element.classList.remove(BOUNCE_CLASS));
}
