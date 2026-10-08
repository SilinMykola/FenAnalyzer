import React from 'react';

/**
 * Dropdown of Gemini models. '' stands for the server's default model.
 * Used in the header and next to a countdown, where switching to another
 * model is the way out of a used-up quota.
 *
 * value, models, defaultModel and onChange come from App as one object, so
 * every picker on the page shows and changes the same choice.
 */
export default function ModelPicker({
  value,
  models = [],
  defaultModel,
  onChange,
  label = '🤖 Gemini',
  ariaLabel = 'Gemini model',
  className = '',
}) {
  // A saved choice stays listed even before the list arrives.
  const options = [...new Set([...(value ? [value] : []), ...models])];

  return (
    <label
      className={`model-picker ${className}`.trim()}
      title="Gemini model for the commentary and for reading images"
    >
      {label && <span className="model-picker-label">{label}</span>}
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{defaultModel ? `Default (${defaultModel})` : 'Default model'}</option>
        {options.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}
