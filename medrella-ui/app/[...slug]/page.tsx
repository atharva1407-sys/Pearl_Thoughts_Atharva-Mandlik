import MedrellaApp from '@/components/MedrellaApp';
export default async function RoutedPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const page = slug.join('/') || 'dashboard';
  return <MedrellaApp page={page} />;
}
