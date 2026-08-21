import { getAuth } from "@clerk/nextjs/server";
import type { GetServerSidePropsContext } from "next";

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const { userId } = getAuth(ctx.req);

  if (!userId) {
    return { redirect: { destination: "/", permanent: false } };
  }

  return { props: { userId } };
}

export default function ProtectedPage() {
  return <main>Protected</main>;
}
