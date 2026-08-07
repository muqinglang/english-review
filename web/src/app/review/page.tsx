import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function ReviewPage() {
  const token = (await cookies()).get("english-review-access")?.value;
  if (!token) redirect("/login");
  return <main className="min-h-screen bg-[#f7f7f2] px-5 py-10 text-[#172223] sm:px-10"><div className="mx-auto max-w-3xl"><nav className="flex justify-between"><Link href="/" className="font-black">English Review</Link><span className="text-sm font-bold text-[#4e8a70]">已登录</span></nav><section className="mt-16 rounded-[2rem] bg-white p-8 shadow-xl shadow-[#172223]/10"><p className="text-sm font-bold tracking-[0.14em] text-[#4e8a70]">YOUR REVIEW SPACE</p><h1 className="mt-3 text-4xl font-black">欢迎回来</h1><p className="mt-5 leading-7 text-[#596861]">登录已成功。Worker 推送完成后，你的到期复习、声音卡片和作答记录会显示在这里。</p></section></div></main>;
}
