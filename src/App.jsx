import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import Home from './pages/Home.jsx';
import Otohifu from './pages/otohifu.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/otohifu' element={<Otohifu />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App