import { ChatView } from "./ChatView";
import { ChatMood } from "../types";

interface ChatTabProps {
  mood: ChatMood;
  onMoodChange: (mood: ChatMood) => void;
}

export function ChatTab({ mood, onMoodChange }: ChatTabProps): JSX.Element {
  return (
    <div className="chat-tab">
      <ChatView mood={mood} onMoodChange={onMoodChange} />
    </div>
  );
}
