'use client';

/**
 * @file LocationInput.jsx
 * Autocomplete location input with 300ms debouncing and accessible listbox.
 * User must pick a suggestion; typing again clears the selection.
 * Listbox fades and slides 6px in --motion-fast.
 *
 * References:
 * ARCHITECTURE.md Section 17.3, 17.7, 25.5.
 */

import { useState, useEffect, useRef } from 'react';
import { useGeocodeSuggest } from '../../hooks/useGeocodeSuggest';
import Spinner from '../ui/Spinner';

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {import('../../lib/types').Place | null} props.value
 * @param {(place: import('../../lib/types').Place | null) => void} props.onChange
 * @param {string} [props.placeholder='']
 * @param {string} [props.error]
 */
export default function LocationInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'City, State, or Address',
  error,
}) {
  const [userTypedText, setUserTypedText] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxId = `${id}-listbox`;

  const currentDisplayText = userTypedText !== null ? userTypedText : value?.label || '';

  const { suggestions, loading, clearSuggestions } = useGeocodeSuggest(currentDisplayText, {
    debounceMs: 300,
    minChars: 2,
    enabled: isOpen && (!value || currentDisplayText !== value.label),
  });

  // Click outside listener to dismiss listbox
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const newText = e.target.value;
    setUserTypedText(newText);
    setIsOpen(true);
    setActiveIndex(-1);

    // Section 17.3: Typing again clears the selected Place object
    if (value) {
      onChange(null);
    }
  };

  const handleSelectSuggestion = (place) => {
    setUserTypedText(null);
    onChange(place);
    setIsOpen(false);
    clearSuggestions();
  };

  const handleClear = () => {
    setUserTypedText('');
    onChange(null);
    clearSuggestions();
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const isSelected = Boolean(value && currentDisplayText === value.label);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-body text-xs uppercase tracking-wider text-text-muted font-medium flex items-center justify-between"
      >
        <span>{label}</span>
        {isSelected && (
          <span className="text-[11px] font-mono text-emerald-400 normal-case flex items-center gap-1 font-normal">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Location locked
          </span>
        )}
      </label>

      <div className="relative">
        <input
          id={id}
          type="text"
          value={currentDisplayText}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
          }
          className={`w-full bg-surface-2 border rounded-xl px-4 py-3 text-sm font-body text-white placeholder-text-faint transition-all duration-150 focus:outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt focus:ring-offset-2 focus:ring-offset-ink ${
            error
              ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500'
              : isSelected
              ? 'border-emerald-500/50'
              : 'border-border-subtle'
          }`}
        />

        {/* Right end adornment: Loading spinner or clear button */}
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
          {loading && <Spinner className="w-4 h-4 text-cobalt" />}
          {!loading && currentDisplayText && (
            <button
              type="button"
              onClick={handleClear}
              tabIndex={-1}
              aria-label={`Clear ${label}`}
              className="pointer-events-auto text-text-faint hover:text-white transition-colors p-1"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Listbox Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-surface-2 border border-border-strong rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-fade-slide-down"
          style={{
            animationDuration: 'var(--motion-fast, 150ms)',
          }}
        >
          {suggestions.map((place, index) => {
            const isHighlighted = index === activeIndex;
            return (
              <li
                key={`${place.lat}-${place.lng}-${index}`}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelectSuggestion(place)}
                className={`px-4 py-2.5 text-xs sm:text-sm font-body cursor-pointer flex items-center justify-between transition-colors duration-100 ${
                  isHighlighted
                    ? 'bg-cobalt text-white'
                    : 'text-text-muted hover:bg-surface-3 hover:text-white'
                }`}
              >
                <span className="truncate">{place.label}</span>
                <span className="font-mono text-[11px] opacity-60 flex-shrink-0 ml-2">
                  US
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Inline validation or helper text */}
      {error ? (
        <p className="text-xs text-red-400 font-body flex items-center gap-1 mt-0.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </p>
      ) : !isSelected && currentDisplayText.length >= 2 && !loading && isOpen && suggestions.length === 0 ? (
        <p className="text-[11px] text-text-faint font-body mt-0.5">
          No matching US locations found. Try a city or state name.
        </p>
      ) : null}
    </div>
  );
}
