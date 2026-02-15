import { useEffect, useState } from "react";
import { JournalPhoto } from "../types";

interface SharedContent {
  text: string;
  photos: JournalPhoto[];
}

export function useSharedContent(): SharedContent | null {
  const [sharedContent, setSharedContent] = useState<SharedContent | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isShare = params.get("share") === "true";

    if (!isShare) {
      return;
    }

    const text = params.get("text") || "";
    const photosJson = params.get("photos");
    let photos: JournalPhoto[] = [];

    if (photosJson) {
      try {
        photos = JSON.parse(photosJson) as JournalPhoto[];
      } catch {
        console.error("Failed to parse shared photos");
      }
    }

    if (text || photos.length > 0) {
      setSharedContent({ text, photos });

      // Clean up URL parameters after extracting shared content
      const url = new URL(window.location.href);
      url.searchParams.delete("share");
      url.searchParams.delete("text");
      url.searchParams.delete("photos");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  return sharedContent;
}
