import { Link } from "react-router-dom"

function Home(){
    const pages = [
        { to: "/otohifu", title: "Otohifu", description: "肘の皮膚の伸びを試すメインページ" },
        { to: "/otohifu_accelator", title: "Otohifu Accelator", description: "加速度センサー版の計測ページ" },
        { to: "/ca", title: "CA", description: "セル・オートマトンの実験ページ" },
        { to: "/img2obj", title: "img2obj", description: "画像からオブジェクト化するページ" },
    ]

    return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-8 text-left shadow-2xl shadow-cyan-950/40 md:p-12">
                <p className="mb-4 inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-1 text-sm font-medium tracking-[0.2em] text-white/90 uppercase">
                    Experiment Hub
                </p>
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white md:text-6xl">
                    肘の皮膚を伸ばしてみよう
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/85 md:text-lg">
                    計測・可視化・画像処理の実験ページをまとめたホームです。下のカードから各ツールに移動できます。
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                {pages.map((page) => (
                    <Link
                        key={page.to}
                        to={page.to}
                        className="group rounded-3xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm transition duration-200 hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-white/10 hover:shadow-xl hover:shadow-cyan-950/20"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-2xl font-semibold text-white">
                                {page.title}
                            </h2>
                            <span className="text-2xl text-cyan-300 transition group-hover:translate-x-1">
                                →
                            </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                            {page.description}
                        </p>
                    </Link>
                ))}
            </section>
        </div>
    </main>
    )
}

export default Home
