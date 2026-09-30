'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ContentItemType, ContentTemplate } from '@/lib/types';

export function useContentTemplate(type: ContentItemType) {
  const [template, setTemplate] = useState<ContentTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/content-templates?type=${type}`);
    if (res.ok) setTemplate(await res.json());
    else console.error('fetchTemplate failed', res.status, await res.text());
    setLoading(false);
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const saveTemplate = useCallback(async (templateMd: string) => {
    const res = await fetch(`/api/content-templates?type=${type}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template_md: templateMd }),
    });
    if (!res.ok) { console.error('saveTemplate failed', res.status, await res.text()); return false; }
    setTemplate(await res.json());
    return true;
  }, [type]);

  return { template, loading, saveTemplate, reload: load };
}
