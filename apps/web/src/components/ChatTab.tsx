import { ChatView } from "./ChatView";
import { ChatMood } from "../types";

interface ChatTabProps {
  mood: ChatMood;
  onMoodChange: (mood: ChatMood) => void;
  onDataMutated?: (tools: string[]) => void;
}

export function ChatTab({ mood, onMoodChange, onDataMutated }: ChatTabProps): JSX.Element {
  return (
    <div className="chat-tab">
      <ChatView mood={mood} onMoodChange={onMoodChange} onDataMutated={onDataMutated} />
    </div>
  );
}
