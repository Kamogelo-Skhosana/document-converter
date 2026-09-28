import { ThemeEngine } from '@themeloom/core'
import { minimalism } from '@themeloom/themes-classic'

/**
 * The app runs on one themeloom theme rather than a hand-rolled palette.
 *
 * A theme is a whole design contract — colour, type, shape and motion — so
 * style.css maps its own variables onto the `--pt-*` custom properties the
 * engine writes, and every rule downstream follows. Swapping theme is a
 * one-line change here plus `data-theme` in index.html, which is set up front
 * so the first paint is already correct.
 *
 * Note what is deliberately *not* themed: the rendered document preview. Those
 * rules describe the file being converted, not the app around it, so theming
 * them would misrepresent what actually gets exported.
 */
export const theme = minimalism

export const engine = new ThemeEngine({
  themes: [theme],
  default: theme.id,
  // Nothing to remember: the app ships one theme, not a picker.
  persist: false,
})
