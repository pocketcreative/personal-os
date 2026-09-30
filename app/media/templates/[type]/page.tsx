import TemplateEditor from '@/components/media/TemplateEditor';
import { CONTENT_ITEM_TYPES, type ContentItemType } from '@/lib/types';
import { notFound } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!CONTENT_ITEM_TYPES.includes(type as ContentItemType)) notFound();
  return <TemplateEditor type={type as ContentItemType} />;
}
