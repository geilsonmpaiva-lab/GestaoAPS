import { ApsHub } from '@/components/aps-hubs';
export const dynamic = 'force-dynamic';
export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <ApsHub kind="organization" {...props} />; }
