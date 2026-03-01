import { ChatView } from "./ChatView";
import { ChatMood } from "../types";

interface ChatTabProps {
  mood: ChatMood;
}

export function ChatTab({ mood }: ChatTabProps): JSX.Element {
  return (
    <div className="chat-tab">
      <ChatView mood={mood} />
    </div>
  );
}
