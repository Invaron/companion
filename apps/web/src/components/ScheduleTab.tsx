import { ScheduleView } from "./ScheduleView";
import { DeadlineList } from "./DeadlineList";

interface ScheduleTabProps {
  scheduleKey: string;
}

export function ScheduleTab({ scheduleKey }: ScheduleTabProps): JSX.Element {
  return (
    <div className="schedule-tab-container">
      <h2>Schedule</h2>
      <div className="schedule-grid">
        <ScheduleView key={scheduleKey} />
        <DeadlineList key={`deadline-${scheduleKey}`} />
      </div>
    </div>
  );
}
