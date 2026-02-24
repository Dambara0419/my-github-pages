import { Link } from "react-router-dom"

function Home(){
    return (
    <>
        <h1 className="p-8">肘の皮膚を伸ばしてみよう</h1>
        <button className="p-4">
            <Link to='otohifu'> Go Otohifu </Link>
        </button>
        <button className="p-4">
            <Link to='otohifu_accelator'> Go Otohifu(加速度 Ver.) </Link>
        </button>
    </>
    )
}

export default Home