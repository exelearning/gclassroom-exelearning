import { currentRoute } from './router';
import { renderHome } from './pages/home';
import { renderDiscovery } from './pages/discovery';
import { renderTeacher } from './pages/teacher';
import { renderStudent } from './pages/student';
import { renderReview } from './pages/review';
import { renderView } from './pages/view';
import { renderPicker } from './pages/picker';
import { renderPublish } from './pages/publish';
import './style.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app root element.');
}

const route = currentRoute();

try {
  switch (route) {
    case '/addon/discovery':
      await renderDiscovery(root);
      break;
    case '/addon/teacher':
      await renderTeacher(root);
      break;
    case '/addon/student':
      await renderStudent(root);
      break;
    case '/addon/review':
      await renderReview(root);
      break;
    case '/view':
      await renderView(root);
      break;
    case '/picker':
      await renderPicker(root);
      break;
    case '/publish':
      await renderPublish(root);
      break;
    case '/':
    default:
      renderHome(root);
      break;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `<main class="app-shell"><h1>gclassroom-exelearning</h1><p class="status" data-kind="error">${escapeHtml(message)}</p></main>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}
