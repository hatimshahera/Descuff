export default function ArticlePage({ params }: { params: { slug: string } }) {
  return <article>Article: {params.slug}</article>;
}
