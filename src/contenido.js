// Contenido diario de 27: citas, datos curiosos y una palabra o expresión de inglés.
//
// Cómo funciona:
// - Cada día toca UN elemento de cada lista. No hay aleatoriedad en el dispositivo: el elemento
//   depende solo de la fecha, así que un mismo día siempre muestra lo mismo y cada día cambia.
// - La lista se recorre completa (en un orden mezclado y distinto en cada vuelta) antes de repetir.
// - La app solo enseña el contenido de hoy y de días ya pasados; nunca el de días futuros.
//
// Para añadir contenido basta con sumar elementos al final de cada lista.
// Citas: t = texto, a = autor, w = obra (opcional), u = enlace al original (opcional), tr = traducción (opcional).
// Datos: c = categoría, t = texto, q = término para consultar en Wikipedia.
// Inglés: w = palabra o expresión, k = tipo, es = significado, ex = ejemplo.

export const QUOTES = [
  { t: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', a: 'Miguel de Cervantes', w: 'Don Quijote de la Mancha, II, 25', u: 'https://www.cervantesvirtual.com/obra-visor/el-ingenioso-hidalgo-don-quijote-de-la-mancha-6/html/05f86699-4b53-4d9b-8ab8-b40ab63fb0b3_83.html' },
  { t: 'La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos.', a: 'Miguel de Cervantes', w: 'Don Quijote de la Mancha, II, 58', u: 'https://www.cervantesvirtual.com/obra/el-ingenioso-hidalgo-don-quijote-de-la-mancha-segunda-parte-dedicatoria-al-conde-de-lemos-capitulo-lviii/' },
  { t: 'Caminante, no hay camino: se hace camino al andar.', a: 'Antonio Machado', w: 'Proverbios y cantares, XXIX', u: 'https://es.wikisource.org/wiki/Proverbios_y_cantares_(Campos_de_Castilla)' },
  { t: 'Todo hombre tiene dos batallas que pelear: en sueños lucha con Dios; y despierto, con el mar.', a: 'Antonio Machado', w: 'Proverbios y cantares, XXVIII', u: 'https://es.wikisource.org/wiki/Proverbios_y_cantares_(Campos_de_Castilla)' },
  { t: 'La pluma es la lengua del alma; cuales fueren los conceptos que en ella se engendraren, tales serán sus escritos.', a: 'Miguel de Cervantes', w: 'Don Quijote de la Mancha, II, 16' },
  { t: 'Donde una puerta se cierra, otra se abre.', a: 'Miguel de Cervantes', w: 'Don Quijote de la Mancha, I, 21' },
  { t: 'Se miente más de la cuenta por falta de fantasía: también la verdad se inventa.', a: 'Antonio Machado', w: 'Proverbios y cantares' },
  { t: 'No es que tengamos poco tiempo, sino que perdemos mucho.', a: 'Séneca', w: 'Sobre la brevedad de la vida, I' },
  { t: 'Mientras aplazamos la vida, esta pasa.', a: 'Séneca', w: 'Cartas a Lucilio, I' },
  { t: 'No hay viento favorable para quien no sabe a qué puerto se dirige.', a: 'Séneca', w: 'Cartas a Lucilio, LXXI' },
  { t: 'Lo que no beneficia al enjambre, tampoco beneficia a la abeja.', a: 'Marco Aurelio', w: 'Meditaciones, VI, 54' },
  { t: 'El alma se tiñe del color de sus pensamientos.', a: 'Marco Aurelio', w: 'Meditaciones, V, 16' },
  { t: 'No nos perturban las cosas, sino los juicios que hacemos sobre ellas.', a: 'Epicteto', w: 'Enquiridión, 5' },
  { t: 'Una vida sin examen no merece la pena ser vivida.', a: 'Sócrates, según Platón', w: 'Apología de Sócrates, 38a' },
  { t: 'Todos los hombres desean por naturaleza saber.', a: 'Aristóteles', w: 'Metafísica, I, 1' },
  { t: 'Yo soy yo y mi circunstancia, y si no la salvo a ella no me salvo yo.', a: 'José Ortega y Gasset', w: 'Meditaciones del Quijote, 1914' },
  { t: 'Que otros se jacten de las páginas que han escrito; a mí me enorgullecen las que he leído.', a: 'Jorge Luis Borges', w: 'Un lector, en Elogio de la sombra' },
  { t: 'La vida no es la que uno vivió, sino la que uno recuerda y cómo la recuerda para contarla.', a: 'Gabriel García Márquez', w: 'Vivir para contarla' },
  { t: 'Todo hombre puede ser, si se lo propone, escultor de su propio cerebro.', a: 'Santiago Ramón y Cajal', w: 'Reglas y consejos sobre investigación científica' },
  { t: 'La imaginación es más importante que el conocimiento.', a: 'Albert Einstein', w: 'Entrevista en The Saturday Evening Post, 1929' },
  { t: 'Si he visto más lejos, ha sido subiéndome a hombros de gigantes.', a: 'Isaac Newton', w: 'Carta a Robert Hooke, 1675' },
  { t: 'Solo podemos ver una corta distancia hacia delante, pero vemos que hay mucho por hacer.', a: 'Alan Turing', w: 'Computing Machinery and Intelligence, 1950' },
  { t: 'La optimización prematura es la raíz de todos los males (o al menos de la mayoría) en programación.', a: 'Donald Knuth', w: 'Structured Programming with go to Statements, 1974' },
  { t: 'Preguntarse si una máquina puede pensar es tan interesante como preguntarse si un submarino puede nadar.', a: 'Edsger W. Dijkstra', w: 'EWD898, 1984' },
  { t: 'La simplicidad es requisito previo de la fiabilidad.', a: 'Edsger W. Dijkstra', w: 'EWD498' },
  { t: 'Simple es mejor que complejo.', a: 'Tim Peters', w: 'El Zen de Python (PEP 20)' },
  { t: 'Los errores nunca deberían pasar en silencio.', a: 'Tim Peters', w: 'El Zen de Python (PEP 20)' },
  { t: 'Los límites de mi lenguaje significan los límites de mi mundo.', a: 'Ludwig Wittgenstein', w: 'Tractatus logico-philosophicus, 5.6' },
  { t: 'Quien tiene un porqué para vivir puede soportar casi cualquier cómo.', a: 'Friedrich Nietzsche', w: 'Crepúsculo de los ídolos' },
  { t: '¡Atrévete a saber! Ten el valor de servirte de tu propio entendimiento.', a: 'Immanuel Kant', w: '¿Qué es la Ilustración?, 1784' },
  { t: 'Toda la desgracia de los hombres viene de una sola cosa: no saber estarse quietos en una habitación.', a: 'Blaise Pascal', w: 'Pensamientos' },
  { t: 'En medio del invierno descubrí por fin que había en mí un verano invencible.', a: 'Albert Camus', w: 'Regreso a Tipasa, en El verano, 1954' },
  { t: 'El primer principio es que no debes engañarte a ti mismo, y tú eres la persona más fácil de engañar.', a: 'Richard Feynman', w: 'Discurso en Caltech, 1974' },
  { t: 'La vida es breve, el arte largo.', a: 'Hipócrates', w: 'Aforismos, I' },
  { t: 'Soy hombre, y nada humano me es ajeno.', a: 'Terencio', w: 'El atormentador de sí mismo' },
  { t: 'Si tienes un jardín y una biblioteca, no te faltará nada.', a: 'Cicerón', w: 'Cartas familiares, IX, 4' },
  { t: 'Un viaje de mil millas comienza con un solo paso.', a: 'Lao-Tsé', w: 'Tao Te Ching, 64' },
  { t: 'La fortuna ayuda a los audaces.', a: 'Virgilio', w: 'Eneida, X, 284' },
  { t: 'Lo bueno, si breve, dos veces bueno.', a: 'Baltasar Gracián', w: 'Oráculo manual y arte de prudencia, 105' },
  { t: 'Toda la vida es sueño, y los sueños, sueños son.', a: 'Pedro Calderón de la Barca', w: 'La vida es sueño' },
  { t: 'Una mujer debe tener dinero y una habitación propia si quiere escribir ficción.', a: 'Virginia Woolf', w: 'Una habitación propia, 1929' },
  { t: 'Debemos saber, sabremos.', a: 'David Hilbert', w: 'Discurso en Königsberg, 1930' },
  { t: 'Pienso, luego existo.', a: 'René Descartes', w: 'Discurso del método, IV' },
  { t: 'To thine own self be true.', tr: 'Sé fiel a ti mismo.', a: 'William Shakespeare', w: 'Hamlet, I, 3' },
  { t: "All the world's a stage, and all the men and women merely players.", tr: 'El mundo entero es un escenario, y todos los hombres y mujeres, meros actores.', a: 'William Shakespeare', w: 'As You Like It, II, 7' },
];

export const FACTS = [
  // Matemáticas
  { c: 'Matemáticas', t: '0,999… (con infinitos nueves) es exactamente igual a 1, no «casi» 1: son dos escrituras del mismo número.', q: '0,999…' },
  { c: 'Matemáticas', t: 'La identidad de Euler, e^(iπ) + 1 = 0, une en una sola igualdad cinco constantes fundamentales: 0, 1, e, i y π.', q: 'Identidad de Euler' },
  { c: 'Matemáticas', t: 'Hay infinitos números primos. Euclides lo demostró hace unos 2.300 años con un argumento que sigue enseñándose hoy.', q: 'Infinitud de los números primos' },
  { c: 'Matemáticas', t: '220 y 284 son «números amigos»: la suma de los divisores propios de cada uno da el otro.', q: 'Números amigos' },
  { c: 'Matemáticas', t: 'El signo «=» lo introdujo Robert Recorde en 1557 porque, según dijo, no hay dos cosas más iguales que dos rectas paralelas.', q: 'Signo igual' },
  { c: 'Matemáticas', t: 'Paradoja del cumpleaños: con solo 23 personas, la probabilidad de que dos cumplan años el mismo día supera el 50 %.', q: 'Paradoja del cumpleaños' },
  { c: 'Matemáticas', t: 'Un gúgol es 10^100. El nombre lo propuso Milton Sirotta, de 9 años, sobrino del matemático Edward Kasner.', q: 'Gúgol' },
  { c: 'Matemáticas', t: 'El último teorema de Fermat se enunció en 1637 y no se demostró hasta 1994-1995, por Andrew Wiles.', q: 'Último teorema de Fermat' },
  { c: 'Matemáticas', t: 'Problema de Monty Hall: si te ofrecen cambiar de puerta, hacerlo te da 2/3 de probabilidad de ganar, no 1/2.', q: 'Problema de Monty Hall' },
  { c: 'Matemáticas', t: 'Cuadrar el círculo con regla y compás es imposible porque π es trascendente, algo que Lindemann demostró en 1882.', q: 'Cuadratura del círculo' },
  // Informática
  { c: 'Informática', t: 'Python se llama así por el grupo humorístico Monty Python, no por la serpiente. Lo creó Guido van Rossum.', q: 'Python' },
  { c: 'Informática', t: 'En 1843 Ada Lovelace publicó un método para calcular números de Bernoulli en la máquina analítica de Babbage, considerado por muchos el primer programa pensado para una máquina.', q: 'Ada Lovelace' },
  { c: 'Informática', t: 'En 1947 se encontró una polilla atrapada en un relé del Harvard Mark II y se pegó en el cuaderno de registro con la anotación de «bug» real. El término ya se usaba antes en ingeniería.', q: 'Grace Hopper' },
  { c: 'Informática', t: 'En Python, 0.1 + 0.2 da 0.30000000000000004 porque los decimales se guardan en binario (IEEE 754) y 0,1 no tiene representación exacta.', q: 'IEEE 754' },
  { c: 'Informática', t: 'Muchos sistemas cuentan el tiempo en segundos desde el 1 de enero de 1970 (UTC). Es la «época Unix».', q: 'Tiempo Unix' },
  { c: 'Informática', t: 'El problema del año 2038: los sistemas que guardan el tiempo Unix en un entero de 32 bits con signo se desbordarán el 19 de enero de 2038.', q: 'Problema del año 2038' },
  { c: 'Informática', t: 'El término «inteligencia artificial» se acuñó para la conferencia de Dartmouth de 1956, organizada por John McCarthy y otros.', q: 'Conferencia de Dartmouth' },
  { c: 'Informática', t: 'En 1950 Alan Turing propuso el «juego de imitación», hoy conocido como test de Turing, para plantear si una máquina puede pensar.', q: 'Prueba de Turing' },
  { c: 'Informática', t: 'En 1997, Deep Blue de IBM venció a Garri Kaspárov en un match de ajedrez por 3½ a 2½.', q: 'Deep Blue' },
  { c: 'Informática', t: 'En marzo de 2016, AlphaGo derrotó al campeón de go Lee Sedol por 4 a 1.', q: 'AlphaGo' },
  { c: 'Informática', t: 'Claude Shannon popularizó la palabra «bit» en su artículo de 1948 sobre teoría de la información; el término se atribuye a John Tukey.', q: 'Bit' },
  { c: 'Informática', t: 'El primer lenguaje de alto nivel de uso generalizado, FORTRAN, nació en IBM bajo la dirección de John Backus; su primer compilador llegó en 1957.', q: 'Fortran' },
  // Ciencia y universo
  { c: 'Espacio', t: 'Un día en Venus (una rotación) dura unos 243 días terrestres, más que su año, que dura unos 225.', q: 'Venus (planeta)' },
  { c: 'Espacio', t: 'La luz del Sol tarda unos 8 minutos y 20 segundos en llegar a la Tierra.', q: 'Sol' },
  { c: 'Espacio', t: 'Alrededor del 99,86 % de la masa del Sistema Solar está en el Sol.', q: 'Sistema solar' },
  { c: 'Espacio', t: 'Un año luz equivale a unos 9,46 billones de kilómetros.', q: 'Año luz' },
  { c: 'Espacio', t: 'El helio se detectó primero en el Sol (1868, por su espectro) y solo después se aisló en la Tierra (1895).', q: 'Helio' },
  { c: 'Espacio', t: 'El Voyager 1, lanzado en 1977, es el objeto humano más lejano de la Tierra y entró en el espacio interestelar en 2012.', q: 'Voyager 1' },
  { c: 'Espacio', t: 'La Estación Espacial Internacional da una vuelta a la Tierra cada 90 minutos aproximadamente, unas 16 órbitas al día.', q: 'Estación Espacial Internacional' },
  { c: 'Física y química', t: 'El cero absoluto es 0 K, es decir, −273,15 °C.', q: 'Cero absoluto' },
  { c: 'Física y química', t: 'El diamante y el grafito son carbono puro: lo que cambia es cómo se ordenan los átomos.', q: 'Alótropos del carbono' },
  { c: 'Física y química', t: 'El hidrógeno es el elemento más abundante del universo.', q: 'Hidrógeno' },
  { c: 'Física y química', t: 'Los relojes de los satélites GPS necesitan correcciones de relatividad: sin ellas, el error de posición crecería varios kilómetros al día.', q: 'Sistema de posicionamiento global' },
  { c: 'Física y química', t: 'Marie Curie es la única persona que ha ganado Nobel en dos ciencias distintas: Física (1903) y Química (1911).', q: 'Marie Curie' },
  { c: 'Física y química', t: 'La Tierra no es una esfera perfecta: su radio en el ecuador es unos 21 km mayor que el de los polos.', q: 'Figura de la Tierra' },
  // Cuerpo y mente
  { c: 'Cuerpo y mente', t: 'El ADN de una sola célula humana, estirado, mediría unos 2 metros.', q: 'Ácido desoxirribonucleico' },
  { c: 'Cuerpo y mente', t: 'Los bebés nacen con más de 270 huesos; muchos se fusionan y un adulto tiene 206.', q: 'Esqueleto humano' },
  { c: 'Cuerpo y mente', t: 'El cerebro pesa alrededor del 2 % del cuerpo pero consume en torno al 20 % de la energía en reposo.', q: 'Cerebro humano' },
  { c: 'Cuerpo y mente', t: 'El corazón late unas 100.000 veces al día, a un ritmo medio de 70 pulsaciones por minuto.', q: 'Corazón' },
  { c: 'Cuerpo y mente', t: 'El estribo, en el oído medio, es el hueso más pequeño del cuerpo humano: mide unos 3 milímetros.', q: 'Estribo (anatomía)' },
  { c: 'Cuerpo y mente', t: 'Curva del olvido (Ebbinghaus, 1885): sin repasar, olvidamos rápido buena parte de lo aprendido, y los repasos espaciados frenan esa caída.', q: 'Curva del olvido' },
  { c: 'Cuerpo y mente', t: 'Un estudio de University College London (2009) midió que formar un hábito tardó de media 66 días, con un rango enorme: de 18 a 254.', q: 'Hábito' },
  { c: 'Cuerpo y mente', t: 'Ley de Parkinson: el trabajo se expande hasta ocupar todo el tiempo disponible para hacerlo. La formuló C. Northcote Parkinson en 1955.', q: 'Ley de Parkinson' },
  { c: 'Cuerpo y mente', t: 'La técnica Pomodoro (bloques de 25 minutos con pausas) la creó Francesco Cirillo a finales de los años 80.', q: 'Técnica Pomodoro' },
  // Naturaleza
  { c: 'Naturaleza', t: 'Los pulpos tienen tres corazones y su sangre es azul por la hemocianina, una proteína con cobre.', q: 'Octopoda' },
  { c: 'Naturaleza', t: 'Los koalas tienen huellas dactilares muy parecidas a las humanas.', q: 'Phascolarctos cinereus' },
  { c: 'Naturaleza', t: 'Los tardígrados han sobrevivido a la exposición al vacío del espacio en experimentos en órbita.', q: 'Tardigrada' },
  { c: 'Naturaleza', t: 'La ballena azul es el animal más grande conocido: puede medir cerca de 30 metros y pesar más de 150 toneladas.', q: 'Balaenoptera musculus' },
  { c: 'Naturaleza', t: 'El ajolote puede regenerar extremidades, partes del corazón y de la médula espinal.', q: 'Ambystoma mexicanum' },
  { c: 'Naturaleza', t: 'La Gran Barrera de Coral se extiende a lo largo de unos 2.300 km y es la mayor estructura construida por seres vivos.', q: 'Gran Barrera de Coral' },
  { c: 'Naturaleza', t: 'El Teide, con 3.715 metros, es la montaña más alta de España.', q: 'Teide' },
  { c: 'Naturaleza', t: 'Islandia es uno de los pocos países del mundo sin mosquitos.', q: 'Islandia' },
  // Historia y cultura
  { c: 'Historia', t: 'La Gran Pirámide de Guiza fue la construcción más alta del mundo durante unos 3.800 años.', q: 'Gran Pirámide de Guiza' },
  { c: 'Historia', t: 'Cleopatra vivió más cerca en el tiempo del alunizaje de 1969 que de la construcción de la Gran Pirámide.', q: 'Cleopatra' },
  { c: 'Historia', t: 'La Universidad de Oxford ya enseñaba antes de que existiera Tenochtitlan, fundada en 1325.', q: 'Universidad de Oxford' },
  { c: 'Historia', t: 'Gutenberg desarrolló en Maguncia, hacia 1450, la imprenta de tipos móviles que cambió la difusión del saber en Europa.', q: 'Johannes Gutenberg' },
  { c: 'Historia', t: 'Don Quijote (1605 y 1615) es considerada por muchos la primera novela moderna.', q: 'Don Quijote de la Mancha' },
  { c: 'Historia', t: 'El Día Internacional del Libro (23 de abril) fue proclamado por la UNESCO en 1995; la fecha recuerda la muerte de Cervantes y Shakespeare en 1616.', q: 'Día Internacional del Libro' },
  { c: 'Historia', t: 'Rusia abarca 11 husos horarios.', q: 'Husos horarios de Rusia' },
  { c: 'Historia', t: 'La Ciudad del Vaticano es el Estado más pequeño del mundo, con unas 44 hectáreas.', q: 'Ciudad del Vaticano' },
  // Tecnología e ingeniería
  { c: 'Tecnología', t: 'La Torre Eiffel puede crecer hasta unos 15 cm en verano por la dilatación del hierro con el calor.', q: 'Torre Eiffel' },
  { c: 'Tecnología', t: 'La primera llamada desde un teléfono móvil la hizo Martin Cooper, de Motorola, el 3 de abril de 1973.', q: 'Martin Cooper' },
  { c: 'Tecnología', t: 'El IBM 305 RAMAC (1956) incluía el primer disco duro comercial: guardaba unos 5 millones de caracteres en 50 discos de 24 pulgadas (unos 60 cm).', q: 'IBM 305 RAMAC' },
  { c: 'Tecnología', t: 'El primer sitio web lo creó Tim Berners-Lee en el CERN; se hizo público en 1991.', q: 'World Wide Web' },
  { c: 'Economía', t: 'Regla del 72: divide 72 entre el interés anual compuesto y tendrás los años que tarda en duplicarse el dinero. Al 7 %, unos 10 años.', q: 'Regla del 72' },
  // Lenguas
  { c: 'Lenguas', t: 'El español es la segunda lengua del mundo por número de hablantes nativos, por detrás del chino mandarín, con unos 480 millones.', q: 'Idioma español' },
  { c: 'Lenguas', t: 'Muchas palabras españolas vienen del árabe: aceite, azúcar, almohada, ojalá (de «law shá lláh», «si Dios quiere»)…', q: 'Arabismo' },
  { c: 'Lenguas', t: '«Murciélago» es una de las palabras españolas que contiene las cinco vocales una sola vez.', q: 'Murciélago' },
  { c: 'Lenguas', t: '«Robot» viene del checo «robota» (trabajo forzado) y se popularizó con la obra R.U.R. de Karel Čapek, en 1920.', q: 'R.U.R.' },
  { c: 'Lenguas', t: '«Cuarentena» viene del italiano «quaranta giorni», los cuarenta días de aislamiento que se imponían a los barcos.', q: 'Cuarentena' },
  { c: 'Lenguas', t: 'En inglés, «the» es la palabra más frecuente.', q: 'Idioma inglés' },
  { c: 'Lenguas', t: 'Según el Oxford English Dictionary, «run» es la palabra inglesa con más acepciones: más de 600.', q: 'Oxford English Dictionary' },
];

export const WORDS = [
  { w: 'resilient', k: 'adjetivo', es: 'resistente, capaz de recuperarse', ex: 'She is resilient: she bounced back quickly after the setback.' },
  { w: 'thorough', k: 'adjetivo', es: 'minucioso, exhaustivo', ex: 'He did a thorough review of the code.' },
  { w: 'reluctant', k: 'adjetivo', es: 'reacio, poco dispuesto', ex: 'I was reluctant to ask for help.' },
  { w: 'feasible', k: 'adjetivo', es: 'factible, viable', ex: 'Is it feasible to finish this by Friday?' },
  { w: 'concise', k: 'adjetivo', es: 'conciso, breve y claro', ex: 'Keep your answer concise.' },
  { w: 'tedious', k: 'adjetivo', es: 'tedioso, pesado', ex: 'Copying the data by hand was tedious.' },
  { w: 'fluent', k: 'adjetivo', es: 'fluido; que domina un idioma', ex: 'She is fluent in three languages.' },
  { w: 'outcome', k: 'nombre', es: 'resultado, desenlace', ex: 'The outcome of the experiment surprised everyone.' },
  { w: 'insight', k: 'nombre', es: 'comprensión profunda, idea reveladora', ex: 'The book gave me a new insight into how habits work.' },
  { w: 'nuance', k: 'nombre', es: 'matiz', ex: 'Some nuances are lost in translation.' },
  { w: 'overwhelm', k: 'verbo', es: 'abrumar, desbordar', ex: "Don't let the amount of work overwhelm you." },
  { w: 'cope with', k: 'verbo compuesto', es: 'afrontar, sobrellevar', ex: 'How do you cope with so much pressure?' },
  { w: 'get along with', k: 'verbo compuesto', es: 'llevarse bien con', ex: 'I get along with all my classmates.' },
  { w: 'figure out', k: 'verbo compuesto', es: 'descifrar, llegar a entender', ex: 'I finally figured out the bug.' },
  { w: 'rely on', k: 'verbo compuesto', es: 'depender de, confiar en', ex: 'You can rely on me.' },
  { w: 'look forward to', k: 'verbo compuesto', es: 'tener ganas de, esperar con ilusión (+ -ing)', ex: "I'm looking forward to seeing you." },
  { w: 'come up with', k: 'verbo compuesto', es: 'idear, ocurrírsele a uno', ex: 'She came up with a clever solution.' },
  { w: 'put off', k: 'verbo compuesto', es: 'aplazar, posponer', ex: 'Stop putting off your homework.' },
  { w: 'turn out', k: 'verbo compuesto', es: 'resultar, acabar siendo', ex: 'It turned out to be easier than I thought.' },
  { w: 'hit the books', k: 'expresión', es: 'ponerse a estudiar en serio', ex: 'I need to hit the books tonight; the exam is tomorrow.' },
  { w: 'burn the midnight oil', k: 'expresión', es: 'trasnochar trabajando o estudiando', ex: 'We burned the midnight oil to finish the project.' },
  { w: 'a piece of cake', k: 'expresión', es: 'pan comido, muy fácil', ex: 'The test was a piece of cake.' },
  { w: 'break the ice', k: 'expresión', es: 'romper el hielo', ex: 'A joke is a good way to break the ice.' },
  { w: 'once in a blue moon', k: 'expresión', es: 'muy de vez en cuando', ex: 'He only visits once in a blue moon.' },
  { w: 'the ball is in your court', k: 'expresión', es: 'te toca a ti decidir o actuar', ex: "I've made my offer; the ball is in your court." },
  { w: 'spot on', k: 'expresión', es: 'exacto, totalmente acertado', ex: 'Your estimate was spot on.' },
  { w: 'whereas', k: 'conector', es: 'mientras que', ex: 'He loves maths, whereas I prefer languages.' },
  { w: 'nevertheless', k: 'conector', es: 'sin embargo, no obstante', ex: 'It was hard; nevertheless, we finished on time.' },
  { w: 'albeit', k: 'conector formal', es: 'aunque, si bien', ex: 'The plan worked, albeit slowly.' },
  { w: 'eventually', k: 'falso amigo', es: 'finalmente, con el tiempo (NO es «eventualmente»)', ex: 'Eventually, she learned to code.' },
  { w: 'actually', k: 'falso amigo', es: 'en realidad (NO es «actualmente»; eso es «currently»)', ex: 'Actually, I disagree with you.' },
  { w: 'sensible', k: 'falso amigo', es: 'sensato, razonable (NO es «sensible»; eso es «sensitive»)', ex: 'That is a sensible idea.' },
  { w: 'library', k: 'falso amigo', es: 'biblioteca (una librería es «bookshop» o «bookstore»)', ex: 'I study at the library after school.' },
  { w: 'attend', k: 'falso amigo', es: 'asistir a (NO es «atender»)', ex: 'She attends a Python class every Monday.' },
  { w: 'realise / realize', k: 'falso amigo', es: 'darse cuenta de (NO es «realizar»; eso es «carry out»)', ex: 'I realised I had forgotten my keys.' },
  { w: 'lend / borrow', k: 'verbos', es: 'lend = prestar a alguien; borrow = pedir prestado', ex: 'Can you lend me your pen? I want to borrow it for a minute.' },
];

// ---- Selección diaria ----

export function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Orden mezclado y fijo de una vuelta completa por la lista.
function order(len, cycle, salt) {
  const rnd = mulberry32(cycle * 7919 + salt * 104729 + 12345);
  const idx = Array.from({ length: len }, (_, i) => i);
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function pick(list, dateStr, salt = 0) {
  const len = list.length;
  const n = dayNumber(dateStr);
  const cycle = Math.floor(n / len);
  const pos = ((n % len) + len) % len;
  const idx = order(len, cycle, salt);
  // Evita que el último elemento de una vuelta sea el primero de la siguiente.
  if (len > 1) {
    const prevLast = order(len, cycle - 1, salt)[len - 1];
    if (idx[0] === prevLast) [idx[0], idx[1]] = [idx[1], idx[0]];
  }
  return list[idx[pos]];
}

export function dayContent(dateStr) {
  return { quote: pick(QUOTES, dateStr, 1), fact: pick(FACTS, dateStr, 2), word: pick(WORDS, dateStr, 3) };
}

// Busca un elemento guardado como favorito por su clave (texto de la cita o del dato; palabra en inglés).
export function findItem(key) {
  const q = QUOTES.find(x => x.t === key); if (q) return { kind: 'quote', item: q };
  const f = FACTS.find(x => x.t === key); if (f) return { kind: 'fact', item: f };
  const w = WORDS.find(x => x.w === key); if (w) return { kind: 'word', item: w };
  return null;
}
