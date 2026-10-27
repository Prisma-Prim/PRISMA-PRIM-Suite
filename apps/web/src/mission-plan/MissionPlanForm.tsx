import { useId, useState } from 'react';
import { useMissionPlanCopy } from './mission-plan.copy';
import type { PlanContent } from './mission-plan-response';
import { useInterfaceLocale } from '../localization/interface-locale';
function row() {
  return {
    key: crypto.randomUUID(),
    title: '',
    activity: '',
    intendedResult: '',
  };
}
export function MissionPlanForm({
  initial,
  disabled,
  onPublish,
  onCancel,
}: {
  initial: PlanContent | null;
  disabled: boolean;
  onPublish: (v: PlanContent) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PlanContent>(
      () => initial ?? { title: '', activities: [row()] },
    ),
    [invalid, setInvalid] = useState(false);
  const c = useMissionPlanCopy(),
    prefix = useId(),
    { formatNumber } = useInterfaceLocale();
  function change(
    key: string,
    field: 'title' | 'activity' | 'intendedResult',
    value: string,
  ) {
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.key === key ? { ...a, [field]: value } : a,
      ),
    }));
  }
  function move(index: number, offset: number) {
    setDraft((d) => {
      const list = [...d.activities],
        target = list[index + offset],
        source = list[index];
      if (!source || !target) return d;
      list[index] = target;
      list[index + offset] = source;
      return { ...d, activities: list };
    });
  }
  return (
    <form
      className="mission-plan-form"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = {
          title: draft.title.trim(),
          activities: draft.activities.map((a) => ({
            ...a,
            title: a.title.trim(),
          })),
        };
        if (
          !normalized.title ||
          normalized.title.length > 200 ||
          normalized.activities.length < 1 ||
          normalized.activities.length > 50 ||
          normalized.activities.some(
            (a) =>
              !a.title ||
              a.title.length > 200 ||
              [a.activity, a.intendedResult].some(
                (s) => !s.trim() || Array.from(s).length > 2000,
              ),
          )
        ) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        onPublish(normalized);
      }}
    >
      <fieldset disabled={disabled}>
        <legend>{initial ? c('edit') : c('new')}</legend>
        <label htmlFor={prefix + 'title'}>{c('title')}</label>
        <input
          id={prefix + 'title'}
          value={draft.title}
          maxLength={200}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        {draft.activities.map((a, n) => (
          <fieldset key={a.key}>
            <legend>
              {c('activity')} {formatNumber(n + 1)}
            </legend>
            <label htmlFor={prefix + a.key + 'title'}>{c('taskTitle')}</label>
            <input
              id={prefix + a.key + 'title'}
              value={a.title}
              maxLength={200}
              onChange={(e) => change(a.key, 'title', e.target.value)}
            />
            <label htmlFor={prefix + a.key + 'activity'}>{c('activity')}</label>
            <textarea
              id={prefix + a.key + 'activity'}
              value={a.activity}
              onChange={(e) => change(a.key, 'activity', e.target.value)}
            />
            <label htmlFor={prefix + a.key + 'result'}>{c('result')}</label>
            <textarea
              id={prefix + a.key + 'result'}
              value={a.intendedResult}
              onChange={(e) => change(a.key, 'intendedResult', e.target.value)}
            />
            <div className="mission-plan-actions">
              <button
                type="button"
                disabled={n === 0}
                onClick={() => move(n, -1)}
              >
                {c('up')} {formatNumber(n + 1)}
              </button>
              <button
                type="button"
                disabled={n === draft.activities.length - 1}
                onClick={() => move(n, 1)}
              >
                {c('down')} {formatNumber(n + 1)}
              </button>
              <button
                type="button"
                disabled={draft.activities.length === 1}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    activities: d.activities.filter((r) => r.key !== a.key),
                  }))
                }
              >
                {c('remove')} {formatNumber(n + 1)}
              </button>
            </div>
          </fieldset>
        ))}
        <div className="mission-plan-actions">
          <button
            type="button"
            disabled={draft.activities.length >= 50}
            onClick={() =>
              setDraft((d) => ({ ...d, activities: [...d.activities, row()] }))
            }
          >
            {c('add')}
          </button>
          <button type="submit">{c('publish')}</button>
          <button type="button" onClick={onCancel}>
            {c('cancel')}
          </button>
        </div>
        {invalid && <p role="alert">{c('invalid')}</p>}
      </fieldset>
    </form>
  );
}
