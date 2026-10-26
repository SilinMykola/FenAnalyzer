import React from 'react';
import { useT } from '../i18n';

/**
 * Dropdown of Gemini models. '' stands for the server's default model.
 * extraOptions ([{ value, label }]) are listed first, for readers that are
 * not Gemini models, such as the local board reader next to the image box.
 * Used in the header and next to a countdown, where switching to another
 * model is the way out of a used-up quota.
 *
 * value, models, defaultModel and onChange come from App as one object, so
 * every picker on the page shows and changes the same choice.
 */
function ModelPicker({
  value,
  models = [],
  defaultModel,
  onChange,
  extraOptions = [],
  label = '🤖 Gemini',
  ariaLabel,
  className = '',
}) {
  const t = useT();
  // A saved choice stays listed even before the list arrives.
  const extraValues = extraOptions.map((option) => option.value);
  const options = [...new Set([...(value ? [value] : []), ...models])].filter(
    (model) => !extraValues.includes(model)
  );

  return (
    <label className={`model-picker ${className}`.trim()} title={t('modelPicker.hint')}>
      {label && <span className="model-picker-label">{label}</span>}
      <select
        aria-label={ariaLabel || t('modelPicker.aria')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {extraOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value="">
          {defaultModel
            ? t('modelPicker.default', { model: defaultModel })
            : t('modelPicker.defaultPlain')}
        </option>
        {options.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </label>
  );
}

// Re-rendered only when its own props change, not on every countdown tick.
export default React.memo(ModelPicker);
