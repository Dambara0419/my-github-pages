import { Link } from "react-router-dom"

function Home(){
    return (
    <>
        <h1 className="p-8">肘の皮膚を伸ばしてみよう</h1>
        <button>
            <Link to='otohifu'> Go Otohifu </Link>
        </button>
    </>
    )
}

export default Home