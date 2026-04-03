import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Home from './pages/Home.jsx';
import Otohifu from './pages/otohifu.jsx';
import OtohifuAcc from './pages/otohifu_accelator.jsx';
import GameOfLife from './pages/ca.jsx';
import Img2Obj from './pages/img2obj.jsx';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/otohifu' element={<Otohifu />} />
        <Route path='/otohifu_accelator' element={<OtohifuAcc />} />
        <Route path='/ca' element={<GameOfLife />} />
        <Route path='/img2obj' element={<Img2Obj />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App