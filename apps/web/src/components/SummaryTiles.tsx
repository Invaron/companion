interface SummaryTilesProps {
  todayFocus: string;
  pendingDeadlines: number;
  activeAgents: number;
  journalStreak: number;
}

export function SummaryTiles(props: SummaryTilesProps): JSX.Element {
  return (
    <section className="tile-grid" aria-label="Summary">
      <article className="tile">
        <h2>Today Focus</h2>
        <p>{props.todayFocus}</p>
      </article>
      <article className="tile">
        <h2>Deadlines</h2>
        <p>{props.pendingDeadlines}</p>
      </article>
      <article className="tile">
        <h2>Active Agents</h2>
        <p>{props.activeAgents}</p>
      </article>
      <article className="tile">
        <h2>Journal Streak</h2>
        <p>{props.journalStreak} days</p>
      </article>
    </section>
  );
}
