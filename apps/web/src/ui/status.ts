export type StatusKind = 'info' | 'success' | 'warn' | 'error';

export class StatusView {
  constructor(private readonly element: HTMLElement) {}

  set(message: string, kind: StatusKind = 'info'): void {
    this.element.textContent = message;
    this.element.dataset['kind'] = kind;
  }

  clear(): void {
    this.element.textContent = '';
    delete this.element.dataset['kind'];
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

export function requireElement<E extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): E {
  const element = root.querySelector<E>(selector);
  if (!element) throw new Error(`Missing UI element ${selector}.`);
  return element;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}
