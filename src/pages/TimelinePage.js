import { timelineControls, renderTimeline } from "../components/Timeline.js";

export function TimelinePage(records, state) {
  return `
    <section class="page-heading"><h1>Linha do Tempo</h1><p>Sequência real de montagem por funcionário, com ociosidade e inconsistências sinalizadas.</p></section>
    ${timelineControls(state)}
  `;
}

export function mountTimelinePage(records, state) {
  renderTimeline(records, state);
}
