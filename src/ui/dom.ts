/** Petit utilitaire de construction DOM typé (aucune injection HTML : textContent uniquement). */

type Child = Node | string | null | undefined | false;

export interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly title?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<
    Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>
  >;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.attrs) Object.entries(props.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (props.on) {
    Object.entries(props.on).forEach(([type, handler]) => {
      if (handler) el.addEventListener(type, handler as EventListener);
    });
  }
  children.forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

/** Met à jour un texte seulement s'il change (évite les reflows inutiles). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggleClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
