export function aliasKeys(o: any): string[] {
  const out: string[] = [];
  const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
  push('oid', o?.optionId);
  push('id',  o?.id);
  push('val', o?.value);
  if (typeof o?.text === 'string') {
      const t = norm(o.text);
      if (t) out.push(`t:${t}`);
      const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
      if (ts) out.push(`ts:${ts}`);
  }
  return out;
}

// A helper for normalization that might be used elsewhere
function norm(s: any): string {
  return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}
