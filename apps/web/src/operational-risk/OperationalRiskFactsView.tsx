import { useInterfaceLocale } from '../localization/interface-locale';
import { useOperationalRiskCopy } from './operational-risk.copy';
import { factFields } from './operational-risk.editor';
import type { OperationalRiskFacts } from './operational-risk.types';

export function OperationalRiskFactsView({
  facts,
}: {
  facts: OperationalRiskFacts;
}) {
  const copy = useOperationalRiskCopy();
  const { formatDate } = useInterfaceLocale();
  return (
    <dl className="risk-facts">
      {factFields.map((name) => (
        <div key={name}>
          <dt>{copy(name)}</dt>
          <dd>
            {facts[name] === null
              ? copy(
                  name === 'existingMeasures' || name === 'sourceDescription'
                    ? 'notRecorded'
                    : 'unknown',
                )
              : name === 'plannedDate'
                ? formatDate(`${facts[name]}T00:00:00.000Z`)
                : facts[name]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
