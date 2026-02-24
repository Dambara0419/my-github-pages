import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Home from './pages/Home.jsx';
import Otohifu from './pages/otohifu.jsx';
import OtohifuAcc from './pages/otohifu_accelator.jsx';

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/otohifu' element={<Otohifu />} />
        <Route path='/otohifu_accelator' element={<OtohifuAcc />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App