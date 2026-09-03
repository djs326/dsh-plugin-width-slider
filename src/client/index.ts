/**
 * Client-side plugin: injects a width-slider section into the settings panel.
 *
 * Registers zh/en locale and a custom settings section (settings.section) with
 * the WidthSliderSettings component. Long-press on the slider enters a preview
 * mode with a transparent fixed overlay (only the slider visible). Dragging
 * writes the conversation content width to localStorage and applies
 * --dsh-chat-user-width on the conversation root elements for instant feedback.
 *
 * Also hides the native width-drag handles: injects a global style targeting
 * the stable [data-width-handle] attribute (the hashed class name changes on
 * every DSH upgrade, the attribute does not).  Injected at entry so it applies
 * from page load, not only while the settings panel is open.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { WidthSliderSettings } from './WidthSliderSettings.tsx'
import { en, zh, type WidthSliderKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    widthSlider: WidthSliderKey
  }
}

const NS = 'widthSlider'

/**
 * Global style hiding the native transcript width handles.  Uses the
 * data-width-handle attribute (set by the official component) instead of the
 * hashed class name so it survives DSH upgrades.
 */
const HANDLE_HIDE_CSS = `
[data-width-handle]{display:none!important}
`

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'width-slider: dictionaries')

  // Hide native width handles globally — independent of the settings panel.
  ctx.effect(() => {
    const style = document.createElement('style')
    style.id = 'dsh-plugin-width-slider-hide-handles'
    style.textContent = HANDLE_HIDE_CSS
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'width-slider: hide native handles')

  // Inject a custom settings section. The component renders a width slider;
  // long-press enters a transparent overlay with only the slider visible.
  ctx.effect(
    () => ctx.slots.inject('settings.section', () => ctx.slots.register(
      {
        name: 'settings.section',
        id: 'width-slider',
        order: 600,
        label: 'Width Slider',
        locale: NS,
      },
      WidthSliderSettings,
    )),
    'width-slider: settings section',
  )
}