/**
 * Motion module public surface (feature: motion).
 *
 * Narrow barrel for the motion engine: exactly the symbols the rest of the
 * client consumes. Everything used only inside `motion/` (or by its tests)
 * stays out of here, so the internal split - frames, schedule, stagger, the
 * imperative WAAPI primitives, the text reveal, the shake - can change without
 * touching a consumer.
 */
export { installConversationEntrance, type MotionEngineState } from './conversation.ts'
export { motionStateOf } from './state.ts'
export { entranceSpec } from './frames.ts'
export { prefersReducedMotion, replayEntrance } from './waapi.ts'
export { shakeElement } from './shake.ts'
export { installSettingsMotion } from './settingsMotion.ts'
export { MOTION_CSS } from './styles.ts'
export {
  FLICK_MIN_VELOCITY,
  VELOCITY_WINDOW_MS,
  dragVelocity,
  isSettled,
  projectLanding,
  stepSpring,
  type PointerSample,
  type SpringState,
} from './spring.ts'
