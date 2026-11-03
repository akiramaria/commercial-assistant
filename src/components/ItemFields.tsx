import type { PoolItem } from '../lib/types';
import { missingTags } from '../lib/types';
import { DOC_TYPES, RFP_RESPONSES } from '../lib/options';
import { useOptions } from '../lib/store';
import { Checkbox, ComboBox, Field, SelectBox, TagInput, TextBox } from './ui';

/** The tag form for one knowledge-pool item (Figma: KP 05, expanded item card). */
export function ItemFields({
  value,
  onChange,
  showMissing = true,
}: {
  value: PoolItem;
  onChange: (patch: Partial<PoolItem>) => void;
  showMissing?: boolean;
}) {
  const opts = useOptions();
  const missing = showMissing ? new Set(missingTags(value)) : new Set<string>();
  const isRfp = value.docType === 'RFP';

  return (
    <>
      <div className="field-row">
        <Field label="Document type" missing={missing.has('docType')}>
          <SelectBox value={value.docType} options={DOC_TYPES} onChange={(v) => onChange({ docType: v as PoolItem['docType'] })} />
        </Field>
        <Field label={isRfp ? 'Issuer' : 'Client'} missing={missing.has('client')}>
          <ComboBox value={value.client} options={opts.clients} onChange={(v) => onChange({ client: v })} />
        </Field>
        <Field label="Year">
          <TextBox value={value.year} inputMode="numeric" placeholder="2026" onChange={(v) => onChange({ year: v.replace(/[^0-9]/g, '').slice(0, 4) })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Project type" missing={missing.has('projectType')}>
          <ComboBox value={value.projectType} options={opts.projectTypes} onChange={(v) => onChange({ projectType: v })} />
        </Field>
        <Field label="Sector" missing={missing.has('sector')}>
          <ComboBox value={value.sector} options={opts.sectors} onChange={(v) => onChange({ sector: v })} />
        </Field>
        <Field label="Service line" missing={missing.has('serviceLine')}>
          <ComboBox value={value.serviceLine} options={opts.serviceLines} onChange={(v) => onChange({ serviceLine: v })} />
        </Field>
      </div>
      <div className="field-row">
        <Field label={isRfp ? 'Our response' : 'Outcome'}>
          <SelectBox value={value.outcome} options={isRfp ? RFP_RESPONSES : opts.outcomes} onChange={(v) => onChange({ outcome: v })} />
        </Field>
        <Field label="Engagement model">
          <SelectBox value={value.engagementModel} options={opts.engagementModels} onChange={(v) => onChange({ engagementModel: v })} />
        </Field>
        <Field label={isRfp ? 'Budget (SGD)' : 'Fee (SGD)'}>
          <TextBox
            value={value.fee ? Number(value.fee).toLocaleString('en-US') : ''}
            inputMode="numeric"
            placeholder="0"
            onChange={(v) => onChange({ fee: v.replace(/[^0-9]/g, '') })}
          />
        </Field>
      </div>
      <Field label="Keywords">
        <TagInput value={value.tags} suggestions={opts.tags} onChange={(tags) => onChange({ tags })} />
      </Field>
      <div className="divider" />
      <Checkbox
        checked={value.sensitive}
        onChange={(sensitive) => onChange({ sensitive })}
        label="Contains client-sensitive information"
        hint="Client names and figures are masked before the assistant reuses this in other proposals."
      />
    </>
  );
}

export function tagSummary(i: PoolItem): string {
  return [i.docType, i.client, i.projectType, i.sector, i.serviceLine, i.year].filter(Boolean).join(' · ');
}
