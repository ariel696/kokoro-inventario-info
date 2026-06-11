import { useEffect, useState } from 'react'
import './App.css'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'

const firebaseConfig = {
  projectId: 'happy-kokoro-inventario',
  appId: '1:262337395080:web:663e1c1840b777fb07623d',
  storageBucket: 'happy-kokoro-inventario.firebasestorage.app',
  apiKey: 'AIzaSyAjDnuUT7QzPHYZTtbWePFtgatjH8z-jx4',
  authDomain: 'happy-kokoro-inventario.firebaseapp.com',
  messagingSenderId: '262337395080',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const adminPin = '6969'

const gruposIniciales = ['Hamburguesas', 'Postres', 'Otros']

const unidades = ['unidades', 'kg', 'g', 'litros', 'ml', 'frascos', 'bolsas', 'cajas', 'barras']

const legacyStorageKeys = {
  ingredientes: 'happy-kokoro-inventario',
  recetas: 'happy-kokoro-recetas',
  grupos: 'happy-kokoro-grupos',
}

const crearPasoReceta = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  texto: '',
  mediaUrl: '',
  mediaTipo: 'imagen',
})

const normalizarPasosReceta = (pasos) => {
  if (Array.isArray(pasos)) {
    const pasosLimpios = pasos.map((paso, index) => ({
      id: paso.id || `${Date.now()}-${index}`,
      texto: paso.texto || paso.descripcion || '',
      mediaUrl: paso.mediaUrl || paso.imagenUrl || paso.videoUrl || '',
      mediaTipo: paso.mediaTipo || (paso.videoUrl ? 'video' : 'imagen'),
    }))
    return pasosLimpios.length ? pasosLimpios : [crearPasoReceta()]
  }

  if (typeof pasos === 'string' && pasos.trim()) {
    return pasos
      .split(/\r?\n+/)
      .map((texto, index) => ({
        ...crearPasoReceta(),
        id: `${Date.now()}-${index}`,
        texto: texto.trim(),
      }))
  }

  return [crearPasoReceta()]
}

const esVideoUrl = (url = '') => {
  const limpia = url.toLowerCase().split('?')[0]
  return limpia.endsWith('.mp4') || limpia.endsWith('.webm') || limpia.endsWith('.ogg')
}

const normalizarTexto = (texto = '') =>
  texto
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const tokenizarIngrediente = (texto = '') =>
  normalizarTexto(texto)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['con', 'para', 'del', 'los', 'las'].includes(token))

const distanciaCorta = (a, b) => {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 1) return 2
  let diferencias = 0
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
    } else {
      diferencias += 1
      if (diferencias > 1) return diferencias
      if (a.length > b.length) i += 1
      else if (b.length > a.length) j += 1
      else {
        i += 1
        j += 1
      }
    }
  }
  return diferencias + (a.length - i) + (b.length - j)
}

const coincideIngredienteReceta = (nombreInventario, nombreReceta) => {
  const inventario = normalizarTexto(nombreInventario)
  const receta = normalizarTexto(nombreReceta)
  if (!inventario || !receta) return false
  if (inventario === receta || inventario.includes(receta) || receta.includes(inventario)) return true

  const tokensReceta = tokenizarIngrediente(nombreReceta)
  const tokensInventario = tokenizarIngrediente(nombreInventario)
  if (tokensReceta.length === 0 || tokensInventario.length === 0) return false

  return tokensReceta.every((tokenReceta) =>
    tokensInventario.some((tokenInventario) =>
      tokenInventario.includes(tokenReceta)
      || tokenReceta.includes(tokenInventario)
      || distanciaCorta(tokenInventario, tokenReceta) <= 1
    )
  )
}

function readLegacyJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    console.warn(`No se pudo leer ${key} desde localStorage`, error)
    return fallback
  }
}

function App() {
  const [paginaActual, setPaginaActual] = useState('inicio')
  const [pin, setPin] = useState('')
  const [adminAutorizado, setAdminAutorizado] = useState(false)
  const [errorPin, setErrorPin] = useState('')
  const [ingredientes, setIngredientes] = useState([])
  const [recetas, setRecetas] = useState([])
  const [grupos, setGrupos] = useState(gruposIniciales)
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarGestorGrupos, setMostrarGestorGrupos] = useState(false)
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [recetaInventarioId, setRecetaInventarioId] = useState('')
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [editando, setEditando] = useState(null)
  const [mostrarFormularioReceta, setMostrarFormularioReceta] = useState(false)
  const [recetaEditando, setRecetaEditando] = useState(null)
  const [recetaAbierta, setRecetaAbierta] = useState(null)
  const [seccionAbierta, setSeccionAbierta] = useState(null)
  const [modoEdicionRecetas, setModoEdicionRecetas] = useState(false)
  const [imagenTooltip, setImagenTooltip] = useState(null)
  const [mostrarFormularioProducto, setMostrarFormularioProducto] = useState(false)
  const [editandoProducto, setEditandoProducto] = useState(null)
  const [formularioProducto, setFormularioProducto] = useState({
    nombre: '',
    cantidad: 0,
    unidad: 'unidades',
    precioVenta: '',
    imagenUrl: '',
  })
  const [formulario, setFormulario] = useState({
    nombre: '',
    grupo: gruposIniciales[0],
    cantidad: 0,
    unidad: 'unidades',
    precioCompra: '',
    stockMinimo: 1,
    imagenUrl: '',
  })
  const [formularioReceta, setFormularioReceta] = useState({
    nombre: '',
    rendimiento: '',
    imagenUrl: '',
    ingredientes: '',
    ingredienteIds: [],
    pasos: [crearPasoReceta()],
  })

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ingredientes'), (snap) => {
      const datosNube = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setIngredientes(datosNube)
      setCargando(false)

      const datosLocales = readLegacyJson(legacyStorageKeys.ingredientes, [])
      if (Array.isArray(datosLocales) && datosLocales.length > datosNube.length) {
        datosLocales.forEach(async (ingrediente) => {
          if (!ingrediente?.nombre) return
          const id = String(ingrediente.id || Date.now())
          await setDoc(doc(db, 'ingredientes', id), {
            nombre: ingrediente.nombre,
            grupo: ingrediente.grupo || gruposIniciales[0],
            cantidad: Math.max(0, Number(ingrediente.cantidad) || 0),
            unidad: ingrediente.unidad || 'unidades',
            precioCompra: ingrediente.precioCompra === '' || ingrediente.precioCompra == null
              ? ''
              : Number(ingrediente.precioCompra),
            stockMinimo: Math.max(0, Number(ingrediente.stockMinimo) || 0),
            imagenUrl: ingrediente.imagenUrl || '',
          })
        })
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'recetas'), (snap) => {
      const datosNube = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRecetas(datosNube)

      const datosLocales = readLegacyJson(legacyStorageKeys.recetas, [])
      if (Array.isArray(datosLocales) && datosLocales.length > datosNube.length) {
        datosLocales.forEach(async (receta) => {
          if (!receta?.nombre) return
          const id = String(receta.id || Date.now())
          await setDoc(doc(db, 'recetas', id), {
            nombre: receta.nombre,
            rendimiento: receta.rendimiento || '',
            imagenUrl: receta.imagenUrl || '',
            ingredientes: Array.isArray(receta.ingredientes) ? receta.ingredientes : [],
            pasos: normalizarPasosReceta(receta.pasos),
          })
        })
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'productos'), (snap) => {
      setProductos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'config'), (snap) => {
      const gruposDoc = snap.docs.find(d => d.id === 'grupos')
      if (gruposDoc) setGrupos(gruposDoc.data().lista)

      const gruposLocales = readLegacyJson(legacyStorageKeys.grupos, [])
      if (!gruposDoc && Array.isArray(gruposLocales) && gruposLocales.length) {
        setDoc(doc(db, 'config', 'grupos'), { lista: gruposLocales })
      }
    })
    return () => unsub()
  }, [])

  const guardarGrupos = async (nuevosGrupos) => {
    await setDoc(doc(db, 'config', 'grupos'), { lista: nuevosGrupos })
  }

  const migrarDatosLocales = async () => {
    const datosLocales = readLegacyJson(legacyStorageKeys.ingredientes, [])
    const recetasLocales = readLegacyJson(legacyStorageKeys.recetas, [])
    const gruposLocales = readLegacyJson(legacyStorageKeys.grupos, [])

    if (!Array.isArray(datosLocales) || datosLocales.length === 0) {
      alert('No encontré ingredientes locales para migrar en este navegador.')
      return
    }

    for (const ingrediente of datosLocales) {
      if (!ingrediente?.nombre) continue
      const id = String(ingrediente.id || Date.now())
      await setDoc(doc(db, 'ingredientes', id), {
        nombre: ingrediente.nombre,
        grupo: ingrediente.grupo || gruposIniciales[0],
        cantidad: Math.max(0, Number(ingrediente.cantidad) || 0),
        unidad: ingrediente.unidad || 'unidades',
        precioCompra: ingrediente.precioCompra === '' || ingrediente.precioCompra == null
          ? ''
          : Number(ingrediente.precioCompra),
        stockMinimo: Math.max(0, Number(ingrediente.stockMinimo) || 0),
        imagenUrl: ingrediente.imagenUrl || '',
      })
    }

    if (Array.isArray(recetasLocales)) {
      for (const receta of recetasLocales) {
        if (!receta?.nombre) continue
        const id = String(receta.id || Date.now())
        await setDoc(doc(db, 'recetas', id), {
          nombre: receta.nombre,
          rendimiento: receta.rendimiento || '',
          imagenUrl: receta.imagenUrl || '',
          ingredientes: Array.isArray(receta.ingredientes) ? receta.ingredientes : [],
          pasos: normalizarPasosReceta(receta.pasos),
        })
      }
    }

    if (Array.isArray(gruposLocales) && gruposLocales.length) {
      await guardarGrupos(gruposLocales)
    }

    alert(`Listo: migré ${datosLocales.length} ingredientes a Firebase.`)
  }

  const abrirAdmin = () => {
    setPaginaActual('admin')
    setPin('')
    setErrorPin('')
  }

  const validarPin = () => {
    if (pin === adminPin) {
      setAdminAutorizado(true)
      setErrorPin('')
      return
    }
    setErrorPin('PIN incorrecto')
  }

  const volverInicio = () => {
    setPaginaActual('inicio')
    setPin('')
    setErrorPin('')
  }

  const limpiarFormulario = () => {
    setFormulario({
      nombre: '',
      grupo: grupos[0] || 'Otros',
      cantidad: 0,
      unidad: 'unidades',
      precioCompra: '',
      stockMinimo: 1,
      imagenUrl: '',
    })
    setEditando(null)
  }

  const abrirNuevoIngrediente = () => {
    limpiarFormulario()
    setMostrarFormulario(true)
  }

  const abrirEditor = (ingrediente) => {
    setEditando(ingrediente.id)
    setFormulario({
      nombre: ingrediente.nombre,
      grupo: ingrediente.grupo || grupos[0],
      cantidad: ingrediente.cantidad,
      unidad: ingrediente.unidad,
      precioCompra: ingrediente.precioCompra,
      stockMinimo: ingrediente.stockMinimo,
      imagenUrl: ingrediente.imagenUrl || '',
    })
    setMostrarFormulario(true)
  }

  const guardarIngrediente = async () => {
    if (formulario.nombre.trim() === '') return
    const ingredienteGuardado = {
      nombre: formulario.nombre.trim(),
      grupo: formulario.grupo,
      cantidad: Math.max(0, Number(formulario.cantidad)),
      unidad: formulario.unidad,
      precioCompra: formulario.precioCompra === '' ? '' : Number(formulario.precioCompra),
      stockMinimo: Math.max(0, Number(formulario.stockMinimo)),
      imagenUrl: formulario.imagenUrl.trim(),
    }
    const id = editando || Date.now().toString()
    await setDoc(doc(db, 'ingredientes', id), ingredienteGuardado)
    limpiarFormulario()
    setMostrarFormulario(false)
  }

  const cambiarCantidad = async (id, nuevaCantidad) => {
    const ing = ingredientes.find(i => i.id === id)
    if (!ing) return
    await setDoc(doc(db, 'ingredientes', id), { ...ing, cantidad: Math.max(0, nuevaCantidad) })
  }

  const eliminarIngrediente = async (id) => {
    await deleteDoc(doc(db, 'ingredientes', id))
  }

  const agregarGrupo = async () => {
    const nombre = nuevoGrupo.trim()
    if (nombre === '' || grupos.includes(nombre)) return
    const nuevos = [...grupos, nombre]
    setGrupos(nuevos)
    await guardarGrupos(nuevos)
    setNuevoGrupo('')
  }

  const eliminarGrupo = async (nombre) => {
    if (grupos.length <= 1) return
    const grupoDestino = grupos.find((g) => g !== nombre) || 'Otros'
    const nuevos = grupos.filter((g) => g !== nombre)
    for (const ing of ingredientes) {
      if (ing.grupo === nombre) {
        await setDoc(doc(db, 'ingredientes', ing.id), { ...ing, grupo: grupoDestino })
      }
    }
    setGrupos(nuevos)
    await guardarGrupos(nuevos)
  }

  const limpiarFormularioReceta = () => {
    setFormularioReceta({ nombre: '', rendimiento: '', imagenUrl: '', ingredientes: '', ingredienteIds: [], pasos: [crearPasoReceta()] })
    setRecetaEditando(null)
  }

  const abrirNuevaReceta = () => {
    limpiarFormularioReceta()
    setMostrarFormularioReceta(true)
  }

  const abrirEditorReceta = (receta) => {
    setRecetaEditando(receta.id)
    setFormularioReceta({
      nombre: receta.nombre,
      rendimiento: receta.rendimiento,
      imagenUrl: receta.imagenUrl || '',
      ingredientes: Array.isArray(receta.ingredientes) ? receta.ingredientes.join(', ') : '',
      ingredienteIds: Array.isArray(receta.ingredienteIds) ? receta.ingredienteIds : [],
      pasos: normalizarPasosReceta(receta.pasos),
    })
    setMostrarFormularioReceta(true)
  }

  const nombresIngredientesFormulario = formularioReceta.ingredientes.split(',').map(i => i.trim()).filter(Boolean)

  const actualizarIngredientesReceta = (valor) => {
    const nuevosNombres = valor.split(',').map(i => i.trim()).filter(Boolean)
    setFormularioReceta((actual) => ({
      ...actual,
      ingredientes: valor,
      ingredienteIds: nuevosNombres.map((nombre, index) => {
        const idActual = actual.ingredienteIds[index]
        if (idActual && ingredientes.some((item) => item.id === idActual)) return idActual
        return ingredientes.find((item) => coincideIngredienteReceta(item.nombre, nombre))?.id || ''
      }),
    }))
  }

  const enlazarIngredienteReceta = (index, ingredienteId) => {
    setFormularioReceta((actual) => {
      const ingredienteIds = [...actual.ingredienteIds]
      ingredienteIds[index] = ingredienteId
      return { ...actual, ingredienteIds }
    })
  }

  const actualizarPasoReceta = (id, campo, valor) => {
    setFormularioReceta((actual) => ({
      ...actual,
      pasos: actual.pasos.map((paso) => (paso.id === id ? { ...paso, [campo]: valor } : paso)),
    }))
  }

  const agregarPasoReceta = () => {
    setFormularioReceta((actual) => ({
      ...actual,
      pasos: [...actual.pasos, crearPasoReceta()],
    }))
  }

  const eliminarPasoReceta = (id) => {
    setFormularioReceta((actual) => {
      const pasos = actual.pasos.filter((paso) => paso.id !== id)
      return { ...actual, pasos: pasos.length ? pasos : [crearPasoReceta()] }
    })
  }

  const guardarReceta = async () => {
    if (formularioReceta.nombre.trim() === '') return
    const pasos = formularioReceta.pasos
      .map((paso, index) => ({
        id: paso.id || `${Date.now()}-${index}`,
        texto: paso.texto.trim(),
        mediaUrl: paso.mediaUrl.trim(),
        mediaTipo: paso.mediaTipo,
      }))
      .filter((paso) => paso.texto || paso.mediaUrl)
    const recetaGuardada = {
      nombre: formularioReceta.nombre.trim(),
      rendimiento: formularioReceta.rendimiento.trim(),
      imagenUrl: formularioReceta.imagenUrl.trim(),
      ingredientes: formularioReceta.ingredientes.split(',').map(i => i.trim()).filter(Boolean),
      ingredienteIds: formularioReceta.ingredienteIds.filter(Boolean),
      pasos,
    }
    const id = recetaEditando || Date.now().toString()
    await setDoc(doc(db, 'recetas', id), recetaGuardada)
    limpiarFormularioReceta()
    setMostrarFormularioReceta(false)
  }

  const eliminarReceta = async (id) => {
    await deleteDoc(doc(db, 'recetas', id))
  }

  const limpiarFormularioProducto = () => {
    setFormularioProducto({ nombre: '', cantidad: 0, unidad: 'unidades', precioVenta: '', imagenUrl: '' })
    setEditandoProducto(null)
  }

  const abrirNuevoProducto = () => {
    limpiarFormularioProducto()
    setMostrarFormularioProducto(true)
  }

  const abrirEditorProducto = (producto) => {
    setEditandoProducto(producto.id)
    setFormularioProducto({
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      unidad: producto.unidad,
      precioVenta: producto.precioVenta,
      imagenUrl: producto.imagenUrl || '',
    })
    setMostrarFormularioProducto(true)
  }

  const guardarProducto = async () => {
    if (formularioProducto.nombre.trim() === '') return
    const productoGuardado = {
      nombre: formularioProducto.nombre.trim(),
      cantidad: Math.max(0, Number(formularioProducto.cantidad)),
      unidad: formularioProducto.unidad,
      precioVenta: formularioProducto.precioVenta === '' ? '' : Number(formularioProducto.precioVenta),
      imagenUrl: formularioProducto.imagenUrl.trim(),
    }
    const id = editandoProducto || Date.now().toString()
    await setDoc(doc(db, 'productos', id), productoGuardado)
    limpiarFormularioProducto()
    setMostrarFormularioProducto(false)
  }

  const cambiarCantidadProducto = async (id, nuevaCantidad) => {
    const prod = productos.find(p => p.id === id)
    if (!prod) return
    await setDoc(doc(db, 'productos', id), { ...prod, cantidad: Math.max(0, nuevaCantidad) })
  }

  const eliminarProducto = async (id) => {
    await deleteDoc(doc(db, 'productos', id))
  }

  const toggleSeccion = (nombre) => {
    setSeccionAbierta((actual) => actual === nombre ? null : nombre)
  }

  const obtenerColorStock = (cantidad) => {
    if (cantidad === 0) return '#ff0000'
    if (cantidad === 1) return '#ff6767'
    if (cantidad === 2) return '#ffc6c6'
    return 'white'
  }

  const formatearPrecio = (precio) => {
    if (precio === '' || precio === undefined || precio === null) return 'Sin precio'
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(precio)
  }

  const buscarImagenIngrediente = (nombre) => {
    const encontrado = ingredientes.find(ing => ing.nombre.toLowerCase() === nombre.toLowerCase())
    return encontrado?.imagenUrl || null
  }

  const ingredientesFiltrados = ingredientes.filter(item =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )
  const recetaInventario = recetas.find((receta) => receta.id === recetaInventarioId)
  const ingredientesRecetaSeleccionada = recetaInventario
    ? (Array.isArray(recetaInventario.ingredientes) ? recetaInventario.ingredientes : [])
      .map((nombreIngrediente, index) => {
        const ingredienteId = recetaInventario.ingredienteIds?.[index]
        if (ingredienteId) return ingredientesFiltrados.find((item) => item.id === ingredienteId)
        return ingredientesFiltrados.find((item) => coincideIngredienteReceta(item.nombre, nombreIngrediente))
      })
      .filter(Boolean)
      .filter((item, index, lista) => lista.findIndex((actual) => actual.id === item.id) === index)
    : []
  const ingredientesRecetaFaltantes = recetaInventario
    ? (Array.isArray(recetaInventario.ingredientes) ? recetaInventario.ingredientes : []).filter((nombreIngrediente, index) =>
      !ingredientes.some((item) => item.id === recetaInventario.ingredienteIds?.[index] || coincideIngredienteReceta(item.nombre, nombreIngrediente))
    )
    : []
  const idsIngredientesReceta = new Set(ingredientesRecetaSeleccionada.map((item) => item.id))
  const ingredientesRestantes = recetaInventario
    ? ingredientesFiltrados.filter((item) => !idsIngredientesReceta.has(item.id))
    : ingredientesFiltrados

  const valorComprado = ingredientes.reduce((total, item) => {
    if (item.precioCompra === '' || item.precioCompra === undefined) return total
    return total + Number(item.precioCompra) * Number(item.cantidad)
  }, 0)

  const stockBajo = ingredientes.filter(item => Number(item.cantidad) <= Number(item.stockMinimo)).length
  const pasosRecetaAbierta = recetaAbierta
    ? normalizarPasosReceta(recetaAbierta.pasos).filter((paso) => paso.texto || paso.mediaUrl)
    : []

  const estiloSeccionBtn = () => ({
    width: '100%', textAlign: 'left', background: 'none', border: 'none',
    borderBottom: '1px solid #444', color: 'white', fontWeight: 'bold',
    fontSize: '1rem', padding: '14px 0', cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  })

  const renderTarjetaIngrediente = (item, destacada = false) => {
    const colorStock = obtenerColorStock(Number(item.cantidad))
    return (
      <article className={`ingredient-card ${destacada ? 'recipe-priority-card' : ''}`} key={item.id}>
        <button className="gear-button" onClick={() => abrirEditor(item)}>⚙</button>
        {item.imagenUrl && <img src={item.imagenUrl} alt={item.nombre} style={{ width: '100%', borderRadius: '6px', marginBottom: '6px', objectFit: 'cover', maxHeight: '80px' }} />}
        <div>
          <h3 style={{ color: colorStock }}>{item.nombre}</h3>
          <p className="price-line">{formatearPrecio(item.precioCompra)}</p>
          <p className="minimum-line">Minimo: {item.stockMinimo} {item.unidad}</p>
        </div>
        <div>
          <p className="stock-line" style={{ color: colorStock }}>Cant: {item.cantidad} {item.unidad}</p>
          <div className="card-actions">
            <button className="minus-button" onClick={() => cambiarCantidad(item.id, Number(item.cantidad) - 1)}>-</button>
            <button className="plus-button" onClick={() => cambiarCantidad(item.id, Number(item.cantidad) + 1)}>+</button>
            <button className="delete-button" onClick={() => eliminarIngrediente(item.id)}>Eliminar</button>
          </div>
        </div>
      </article>
    )
  }

  if (cargando) {
    return (
      <main className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'white', fontSize: '1.2rem' }}>Cargando Happy Kokoro...</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {paginaActual === 'inicio' && (
        <section className="home-screen">
          <p className="eyebrow">Panel interno</p>
          <h1>Happy Kokoro</h1>
          <p className="home-copy">Organización privada para inventario, recetas, gastos y ventas.</p>

          <div className="menu-grid">
            <button className="menu-card inventory-card" onClick={() => setPaginaActual('inventario')}>
              <span className="menu-icon">▦</span>
              <span className="menu-title">Inventario</span>
              <span className="menu-text">Stock disponible, ingredientes y precios de compra.</span>
            </button>

            <button className="menu-card recipe-card" onClick={() => setPaginaActual('recetas')}>
              <span className="menu-icon">◫</span>
              <span className="menu-title">Recetas</span>
              <span className="menu-text">Preparaciones de Happy Kokoro con sus ingredientes.</span>
            </button>

            <button className="menu-card admin-card" onClick={abrirAdmin}>
              <span className="menu-icon">$</span>
              <span className="menu-title">Admin</span>
              <span className="menu-text">Gastos, ventas y datos privados del negocio.</span>
            </button>
          </div>
        </section>
      )}

      {paginaActual === 'inventario' && (
        <section className="page-screen">
          <button className="back-button" onClick={volverInicio}>Volver</button>
          <div className="page-header">
            <p className="eyebrow">Stock disponible</p>
            <h2>Inventario de cocina</h2>
          </div>

          <div className="summary-row">
            <div className="summary-card">
              <span>Ingredientes</span>
              <strong>{ingredientes.length}</strong>
            </div>
            <div className="summary-card">
              <span>Valor comprado</span>
              <strong>{formatearPrecio(valorComprado)}</strong>
            </div>
            <div className="summary-card warning">
              <span>Stock bajo</span>
              <strong>{stockBajo}</strong>
            </div>
          </div>
  <div className="inventory-toolbar" style={{ flexWrap: 'wrap', gap: '8px' }}>
  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar ingrediente..." />
  <select className="recipe-order-select" value={recetaInventarioId} onChange={(e) => setRecetaInventarioId(e.target.value)}>
    <option value="">Orden normal por grupo</option>
    {recetas.map((receta) => <option key={receta.id} value={receta.id}>Primero: {receta.nombre}</option>)}
  </select>
  <button className="primary-button compact" onClick={abrirNuevoIngrediente}>Agregar ingrediente</button>
  <button className="secondary-button compact" onClick={() => setMostrarGestorGrupos(!mostrarGestorGrupos)}>
    {mostrarGestorGrupos ? 'Cerrar grupos' : 'Editar grupos'}
  </button>
  <button
    style={{ backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
    onClick={() => setPaginaActual('productos')}
  >
    Productos listos
  </button>
  <button
    className="secondary-button compact"
    onClick={migrarDatosLocales}
    title="Sube los ingredientes guardados en este navegador a Firebase"
  >
    Migrar a Firebase
  </button>
</div>

          {mostrarGestorGrupos && (
            <div className="ingredient-form">
              <p style={{ color: 'white', marginBottom: '8px', fontWeight: 'bold' }}>Grupos actuales:</p>
              {grupos.map((g) => (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ color: 'white', flex: 1 }}>{g}</span>
                  <button className="delete-button" onClick={() => eliminarGrupo(g)}>Eliminar</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Nombre del nuevo grupo"
                  onKeyDown={(e) => { if (e.key === 'Enter') agregarGrupo() }} />
                <button className="primary-button compact" onClick={agregarGrupo}>Agregar</button>
              </div>
            </div>
          )}

          {mostrarFormulario && (
            <div className="ingredient-form">
              <input value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} placeholder="Nombre del ingrediente" />
              <select value={formulario.grupo} onChange={(e) => setFormulario({ ...formulario, grupo: e.target.value })}>
                {grupos.map((g) => <option key={g}>{g}</option>)}
              </select>
              <input type="number" min="0" value={formulario.cantidad} onChange={(e) => setFormulario({ ...formulario, cantidad: e.target.value })} placeholder="Cantidad" />
              <select value={formulario.unidad} onChange={(e) => setFormulario({ ...formulario, unidad: e.target.value })}>
                {unidades.map((unidad) => <option key={unidad}>{unidad}</option>)}
              </select>
              <input type="number" min="0" value={formulario.precioCompra} onChange={(e) => setFormulario({ ...formulario, precioCompra: e.target.value })} placeholder="Precio compra" />
              <input type="number" min="0" value={formulario.stockMinimo} onChange={(e) => setFormulario({ ...formulario, stockMinimo: e.target.value })} placeholder="Stock minimo" />
              <input value={formulario.imagenUrl} onChange={(e) => setFormulario({ ...formulario, imagenUrl: e.target.value })} placeholder="URL imagen opcional" />
              <button className="primary-button compact" onClick={guardarIngrediente}>{editando ? 'Guardar cambios' : 'Guardar ingrediente'}</button>
              <button className="secondary-button" onClick={() => { limpiarFormulario(); setMostrarFormulario(false) }}>Cancelar</button>
            </div>
          )}

          {recetaInventario && (
            <section className="recipe-inventory-section">
              <div className="recipe-inventory-header">
                <div>
                  <p className="eyebrow">Orden por receta</p>
                  <h3>Ingredientes para {recetaInventario.nombre}</h3>
                </div>
                <span>{ingredientesRecetaSeleccionada.length} encontrados</span>
              </div>
              {ingredientesRecetaSeleccionada.length > 0 ? (
                <div className="ingredient-grid">
                  {ingredientesRecetaSeleccionada.map((item) => renderTarjetaIngrediente(item, true))}
                </div>
              ) : (
                <p className="recipe-inventory-empty">No encontré ingredientes de esta receta en el inventario. Revisa que los nombres estén escritos parecido en receta e inventario.</p>
              )}
              {ingredientesRecetaFaltantes.length > 0 && (
                <div className="missing-ingredients">
                  <strong>Faltan en inventario:</strong>
                  {ingredientesRecetaFaltantes.map((nombre) => <span key={nombre}>{nombre}</span>)}
                </div>
              )}
            </section>
          )}

          {grupos.map((grupo) => {
            const ingredientesDelGrupo = ingredientesRestantes.filter((item) => (item.grupo || grupos[0]) === grupo)
            if (ingredientesDelGrupo.length === 0) return null
            return (
              <div key={grupo}>
                <h3 style={{ color: 'white', margin: '24px 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '6px' }}>{grupo}</h3>
                <div className="ingredient-grid">
                  {ingredientesDelGrupo.map((item) => renderTarjetaIngrediente(item))}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {paginaActual === 'productos' && (
        <section className="page-screen">
          <button className="back-button" onClick={() => setPaginaActual('inventario')}>Volver</button>
          <div className="page-header">
            <p className="eyebrow" style={{ color: '#a78bfa' }}>Listos para vender</p>
            <h2>Productos terminados</h2>
          </div>

          <div className="summary-row">
            <div className="summary-card">
              <span>Productos</span>
              <strong>{productos.length}</strong>
            </div>
            <div className="summary-card">
              <span>Unidades disponibles</span>
              <strong>{productos.reduce((t, p) => t + Number(p.cantidad), 0)}</strong>
            </div>
          </div>

          <div className="inventory-toolbar">
            <button className="primary-button compact" onClick={abrirNuevoProducto}>Agregar producto</button>
          </div>

          {mostrarFormularioProducto && (
            <div className="ingredient-form">
              <input value={formularioProducto.nombre} onChange={(e) => setFormularioProducto({ ...formularioProducto, nombre: e.target.value })} placeholder="Nombre del producto" />
              <input type="number" min="0" value={formularioProducto.cantidad} onChange={(e) => setFormularioProducto({ ...formularioProducto, cantidad: e.target.value })} placeholder="Cantidad disponible" />
              <select value={formularioProducto.unidad} onChange={(e) => setFormularioProducto({ ...formularioProducto, unidad: e.target.value })}>
                {unidades.map((unidad) => <option key={unidad}>{unidad}</option>)}
              </select>
              <input type="number" min="0" value={formularioProducto.precioVenta} onChange={(e) => setFormularioProducto({ ...formularioProducto, precioVenta: e.target.value })} placeholder="Precio de venta" />
              <input value={formularioProducto.imagenUrl} onChange={(e) => setFormularioProducto({ ...formularioProducto, imagenUrl: e.target.value })} placeholder="URL imagen opcional" />
              <button className="primary-button compact" onClick={guardarProducto}>{editandoProducto ? 'Guardar cambios' : 'Guardar producto'}</button>
              <button className="secondary-button" onClick={() => { limpiarFormularioProducto(); setMostrarFormularioProducto(false) }}>Cancelar</button>
            </div>
          )}

          <div className="ingredient-grid">
            {productos.map((prod) => {
              const colorStock = obtenerColorStock(Number(prod.cantidad))
              return (
                <article className="ingredient-card" key={prod.id} style={{ borderTop: '3px solid #7c3aed' }}>
                  <button className="gear-button" onClick={() => abrirEditorProducto(prod)}>⚙</button>
                  {prod.imagenUrl && <img src={prod.imagenUrl} alt={prod.nombre} style={{ width: '100%', borderRadius: '6px', marginBottom: '6px', objectFit: 'cover', maxHeight: '80px' }} />}
                  <div>
                    <h3 style={{ color: colorStock }}>{prod.nombre}</h3>
                    <p className="price-line">{formatearPrecio(prod.precioVenta)}</p>
                  </div>
                  <div>
                    <p className="stock-line" style={{ color: colorStock }}>Cant: {prod.cantidad} {prod.unidad}</p>
                    <div className="card-actions">
                      <button className="minus-button" onClick={() => cambiarCantidadProducto(prod.id, Number(prod.cantidad) - 1)}>-</button>
                      <button className="plus-button" onClick={() => cambiarCantidadProducto(prod.id, Number(prod.cantidad) + 1)}>+</button>
                      <button className="delete-button" onClick={() => eliminarProducto(prod.id)}>Eliminar</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {paginaActual === 'recetas' && !recetaAbierta && (
        <section className="page-screen">
          <button className="back-button" onClick={volverInicio}>Volver</button>
          <div className="page-header">
            <p className="eyebrow">Preparaciones</p>
            <h2>Recetas Happy Kokoro</h2>
          </div>

          <div className="inventory-toolbar">
            <button
              className={modoEdicionRecetas ? 'primary-button compact' : 'secondary-button compact'}
              onClick={() => { setModoEdicionRecetas(!modoEdicionRecetas); setMostrarFormularioReceta(false); limpiarFormularioReceta() }}
            >
              {modoEdicionRecetas ? 'Dejar de editar' : 'Editar recetas'}
            </button>
            {modoEdicionRecetas && <button className="primary-button compact" onClick={abrirNuevaReceta}>Agregar receta</button>}
          </div>

          {modoEdicionRecetas && mostrarFormularioReceta && (
            <div className="recipe-form">
              <div className="recipe-form-header">
                <div>
                  <p className="eyebrow">Editor de receta</p>
                  <h3>{recetaEditando ? 'Actualizar preparación' : 'Nueva preparación'}</h3>
                </div>
              </div>

              <div className="recipe-form-grid">
                <label>
                  <span>Nombre</span>
                  <input value={formularioReceta.nombre} onChange={(e) => setFormularioReceta({ ...formularioReceta, nombre: e.target.value })} placeholder="Smash Burger" />
                </label>
                <label>
                  <span>Rendimiento</span>
                  <input value={formularioReceta.rendimiento} onChange={(e) => setFormularioReceta({ ...formularioReceta, rendimiento: e.target.value })} placeholder="12 unidades" />
                </label>
                <label className="wide-field">
                  <span>Foto principal</span>
                  <input value={formularioReceta.imagenUrl} onChange={(e) => setFormularioReceta({ ...formularioReceta, imagenUrl: e.target.value })} placeholder="images/smash-burger.png o https://..." />
                </label>
                <label className="wide-field">
                  <span>Ingredientes</span>
                  <textarea value={formularioReceta.ingredientes} onChange={(e) => actualizarIngredientesReceta(e.target.value)} placeholder="Pan de papa, cebolla, queso cheddar, pepino" />
                </label>
              </div>

              {nombresIngredientesFormulario.length > 0 && (
                <div className="ingredient-linker">
                  <div className="ingredient-linker-title">
                    <p className="eyebrow">Enlaces al inventario</p>
                    <span>{formularioReceta.ingredienteIds.filter(Boolean).length}/{nombresIngredientesFormulario.length} enlazados</span>
                  </div>
                  {nombresIngredientesFormulario.map((nombre, index) => (
                    <div className="ingredient-link-row" key={`${nombre}-${index}`}>
                      <strong>{nombre}</strong>
                      <select value={formularioReceta.ingredienteIds[index] || ''} onChange={(e) => enlazarIngredienteReceta(index, e.target.value)}>
                        <option value="">Sin enlazar</option>
                        {ingredientes.map((item) => (
                          <option key={item.id} value={item.id}>{item.nombre}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="steps-editor">
                <div className="steps-editor-title">
                  <div>
                    <p className="eyebrow">Preparación</p>
                    <h3>Paso a paso</h3>
                  </div>
                  <button className="secondary-button compact" onClick={agregarPasoReceta}>Agregar paso</button>
                </div>

                {formularioReceta.pasos.map((paso, index) => (
                  <article className="step-card" key={paso.id}>
                    <div className="step-card-top">
                      <strong>Paso {index + 1}</strong>
                      <button className="delete-step-button" onClick={() => eliminarPasoReceta(paso.id)}>Eliminar</button>
                    </div>
                    <textarea value={paso.texto} onChange={(e) => actualizarPasoReceta(paso.id, 'texto', e.target.value)} placeholder="Describe este paso de la preparación" />
                    <div className="step-media-row">
                      <select value={paso.mediaTipo} onChange={(e) => actualizarPasoReceta(paso.id, 'mediaTipo', e.target.value)}>
                        <option value="imagen">Foto</option>
                        <option value="video">Video</option>
                      </select>
                      <input value={paso.mediaUrl} onChange={(e) => actualizarPasoReceta(paso.id, 'mediaUrl', e.target.value)} placeholder="URL de foto o video del paso" />
                    </div>
                  </article>
                ))}
              </div>

              <div className="form-actions">
                <button className="primary-button compact" onClick={guardarReceta}>{recetaEditando ? 'Guardar cambios' : 'Guardar receta'}</button>
                <button className="secondary-button" onClick={() => { limpiarFormularioReceta(); setMostrarFormularioReceta(false) }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="recipe-list">
            {recetas.map((receta) => (
              <article
                className="recipe-panel"
                key={receta.id}
                onClick={() => { if (!modoEdicionRecetas) { setRecetaAbierta(receta); setSeccionAbierta(null) } }}
                style={{ cursor: modoEdicionRecetas ? 'default' : 'pointer' }}
              >
                {modoEdicionRecetas && <button className="gear-button" onClick={(e) => { e.stopPropagation(); abrirEditorReceta(receta) }}>⚙</button>}
                {receta.imagenUrl && <img className="recipe-image" src={receta.imagenUrl} alt={receta.nombre} />}
                <h3>{receta.nombre}</h3>
                {receta.rendimiento && <p className="muted">Rinde: {receta.rendimiento}</p>}
                {modoEdicionRecetas && <button className="delete-recipe-button" onClick={(e) => { e.stopPropagation(); eliminarReceta(receta.id) }}>Eliminar</button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {paginaActual === 'recetas' && recetaAbierta && (
        <section className="page-screen">
          <button className="back-button" onClick={() => setRecetaAbierta(null)}>Volver</button>
          <div className="page-header">
            <p className="eyebrow">Receta</p>
            <h2>{recetaAbierta.nombre}</h2>
          </div>

          {recetaAbierta.imagenUrl && (
            <img src={recetaAbierta.imagenUrl} alt={recetaAbierta.nombre}
              style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: '10px', marginBottom: '24px' }} />
          )}

          {recetaAbierta.rendimiento && (
            <p style={{ color: '#aaa', marginBottom: '20px', fontSize: '0.95rem' }}>Rinde: {recetaAbierta.rendimiento}</p>
          )}

          <div>
            <button style={estiloSeccionBtn()} onClick={() => toggleSeccion('ingredientes')}>
              <span>Ingredientes</span>
              <span>{seccionAbierta === 'ingredientes' ? '▲' : '▼'}</span>
            </button>
            {seccionAbierta === 'ingredientes' && (
              <ul style={{ listStyle: 'none', padding: '12px 0', margin: 0 }}>
                {recetaAbierta.ingredientes.map((ing) => {
                  const imagenIng = buscarImagenIngrediente(ing)
                  return (
                    <li key={ing}
                      style={{ color: '#ddd', padding: '8px 0', borderBottom: '1px solid #2a2a2a', position: 'relative', cursor: imagenIng ? 'pointer' : 'default' }}
                      onMouseEnter={() => imagenIng && setImagenTooltip(ing)}
                      onMouseLeave={() => setImagenTooltip(null)}
                    >
                      • {ing}
                      {imagenTooltip === ing && imagenIng && (
                        <div style={{ position: 'absolute', left: '160px', top: '-10px', zIndex: 100, background: '#1a1a2e', border: '1px solid #444', borderRadius: '10px', padding: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
                          <img src={imagenIng} alt={ing} style={{ width: '140px', height: '100px', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                          <p style={{ color: 'white', fontSize: '0.8rem', textAlign: 'center', margin: '6px 0 0 0' }}>{ing}</p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div style={{ marginTop: '8px' }}>
            <button style={estiloSeccionBtn()} onClick={() => toggleSeccion('preparacion')}>
              <span>Preparación</span>
              <span>{seccionAbierta === 'preparacion' ? '▲' : '▼'}</span>
            </button>
            {seccionAbierta === 'preparacion' && (
              <div className="recipe-steps-view">
                {pasosRecetaAbierta.map((paso, index) => (
                  <article className="recipe-step-view" key={paso.id || index}>
                    <div className="step-number">{index + 1}</div>
                    <div className="step-content">
                      {paso.texto && <p>{paso.texto}</p>}
                      {paso.mediaUrl && (
                        paso.mediaTipo === 'video' || esVideoUrl(paso.mediaUrl)
                          ? <video src={paso.mediaUrl} controls />
                          : <img src={paso.mediaUrl} alt={`Paso ${index + 1} de ${recetaAbierta.nombre}`} />
                      )}
                    </div>
                  </article>
                ))}
                {pasosRecetaAbierta.length === 0 && <p className="muted">Sin pasos guardados.</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {paginaActual === 'admin' && (
        <section className="page-screen admin-screen">
          <button className="back-button" onClick={volverInicio}>Volver</button>
          <div className="page-header">
            <p className="eyebrow">Acceso privado</p>
            <h2>Admin</h2>
          </div>

          {!adminAutorizado ? (
            <div className="pin-box">
              <label>Ingresa PIN de administrador</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN"
                onKeyDown={(e) => { if (e.key === 'Enter') validarPin() }} />
              {errorPin && <p className="error-text">{errorPin}</p>}
              <button className="primary-button" onClick={validarPin}>Entrar</button>
            </div>
          ) : (
            <div className="admin-grid">
              <div className="summary-card"><span>Ventas del mes</span><strong>0</strong></div>
              <div className="summary-card"><span>Gastos registrados</span><strong>$0</strong></div>
              <div className="summary-card"><span>Productos elaborados vendidos</span><strong>0</strong></div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App
