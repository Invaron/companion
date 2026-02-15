import { useEffect, useRef, useState } from "react";
import { getAllJournalTags } from "../lib/api";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function TagInput({ tags, onTagsChange, disabled }: TagInputProps): JSX.Element {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTags = async (): Promise<void> => {
      const fetchedTags = await getAllJournalTags();
      setAllTags(fetchedTags);
    };
    void fetchTags();
  }, []);

  useEffect(() => {
    if (inputValue.trim()) {
      const query = inputValue.toLowerCase();
      const filtered = allTags
        .filter((tag) => tag.toLowerCase().includes(query) && !tags.includes(tag))
        .slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedSuggestionIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  }, [inputValue, allTags, tags]);

  const addTag = (tag: string): void => {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !tags.includes(normalized)) {
      onTagsChange([...tags, normalized]);
    }
    setInputValue("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const removeTag = (tagToRemove: string): void => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        addTag(suggestions[selectedSuggestionIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    } else if (e.key === ",") {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    }
  };

  const handleSuggestionClick = (tag: string): void => {
    addTag(tag);
    inputRef.current?.focus();
  };

  return (
    <div className="tag-input-container">
      <div className="tag-input-wrapper">
        {tags.map((tag) => (
          <span key={tag} className="tag-pill">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="tag-input"
          placeholder={tags.length === 0 ? "Add tags (press Enter or comma)" : ""}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim() && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              setShowSuggestions(false);
              setSelectedSuggestionIndex(-1);
            }, 200);
          }}
          disabled={disabled}
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div ref={suggestionsRef} className="tag-suggestions">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              className={`tag-suggestion ${index === selectedSuggestionIndex ? "selected" : ""}`}
              onClick={() => handleSuggestionClick(suggestion)}
              role="button"
              tabIndex={0}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
