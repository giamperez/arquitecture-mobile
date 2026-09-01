export type MaterialKey =
  | 'concrete'
  | 'steel'
  | 'connection'
  | 'masonry'
  | 'earth'
  | 'wood'
  | 'other';

export interface Observation {
  id: string;
  label: string;
  hint: string;
}

export const MATERIAL_NAMES: Record<MaterialKey, string> = {
  concrete: 'Concreto',
  steel: 'Acero',
  connection: 'Conexión',
  masonry: 'Albañilería',
  earth: 'Tierra',
  wood: 'Madera',
  other: 'Otros',
};

export const MATERIAL_KEYS: MaterialKey[] = [
  'concrete',
  'steel',
  'connection',
  'masonry',
  'earth',
  'wood',
  'other',
];

export const TYPE_OPTIONS: Record<MaterialKey, string[]> = {
  concrete: ['Viga', 'Columna', 'Losa', 'Muro', 'Cimentación', 'Otro'],
  steel: ['Viga', 'Columna', 'Arriostre', 'Cercha', 'Placa', 'Tubo'],
  connection: ['Empernada', 'Soldada', 'Mixta', 'Placa base', 'Empalme'],
  masonry: ['Muro confinado', 'Muro armado', 'Tabique', 'Parapeto', 'Cerco', 'Otro'],
  earth: ['Muro de adobe', 'Muro de tapial', 'Quincha', 'Bloque de tierra', 'Cimiento', 'Otro'],
  wood: ['Viga', 'Columna', 'Cercha', 'Entramado', 'Entablado', 'Conexión', 'Otro'],
  other: ['Elemento compuesto', 'Revestimiento', 'Vidrio estructural', 'No identificado', 'Otro'],
};

export const OBSERVATIONS: Record<MaterialKey, Observation[]> = {
  concrete: [
    { id: 'cracks', label: 'Fisuras o grietas', hint: 'Abertura, patrón o extensión visible' },
    { id: 'spalling', label: 'Desprendimiento del concreto', hint: 'Pérdida del recubrimiento o delaminación' },
    { id: 'rebar', label: 'Exposición del refuerzo', hint: 'Acero visible por pérdida de recubrimiento' },
    { id: 'rebar_corrosion', label: 'Corrosión del refuerzo', hint: 'Óxido, manchas o expansión observable' },
    { id: 'moisture', label: 'Humedad o eflorescencia', hint: 'Filtraciones, manchas o sales' },
    { id: 'honeycomb', label: 'Segregación o cangrejeras', hint: 'Vacíos o agregado expuesto' },
    { id: 'plumb', label: 'Desplome (vertical)', hint: 'Inclinación respecto de la vertical' },
    { id: 'level', label: 'Desnivel (horizontal)', hint: 'Diferencia de cota o pendiente no prevista' },
    { id: 'impact', label: 'Daño por impacto', hint: 'Golpes, roturas o pérdida localizada' },
  ],
  steel: [
    { id: 'corrosion', label: 'Corrosión', hint: 'Óxido superficial o generalizado' },
    { id: 'section_loss', label: 'Pérdida de sección', hint: 'Reducción visible del espesor' },
    { id: 'buckling', label: 'Deformación o pandeo', hint: 'Curvatura, abolladura o alabeo' },
    { id: 'plumb', label: 'Desplome (vertical)', hint: 'Inclinación del elemento respecto de la vertical' },
    { id: 'level', label: 'Desnivel (horizontal)', hint: 'Diferencia de cota o pendiente no prevista' },
    { id: 'coating', label: 'Deterioro de protección', hint: 'Pintura, galvanizado o recubrimiento' },
    { id: 'fracture', label: 'Fisura o fractura', hint: 'Discontinuidad visible en el metal' },
    { id: 'impact', label: 'Daño por impacto', hint: 'Golpe o deformación localizada' },
    { id: 'fire', label: 'Daño por temperatura o fuego', hint: 'Cambio de color o distorsión' },
  ],
  connection: [
    { id: 'loose_bolt', label: 'Perno flojo', hint: 'Falta de ajuste o pretensión aparente' },
    { id: 'missing_bolt', label: 'Perno faltante o dañado', hint: 'Ausencia, rotura o rosca deteriorada' },
    { id: 'corrosion', label: 'Corrosión de pernos o placas', hint: 'Óxido en componentes de la unión' },
    { id: 'oval_hole', label: 'Agujero ovalado', hint: 'Deformación alrededor del perno' },
    { id: 'plate_deformation', label: 'Deformación de placa', hint: 'Alabeo, flexión o separación' },
    { id: 'weld_crack', label: 'Fisura en soldadura', hint: 'Fisura longitudinal o transversal' },
    { id: 'weld_defect', label: 'Defecto de soldadura', hint: 'Socavación, porosidad o falta de continuidad' },
    { id: 'misalignment', label: 'Desalineación u holgura', hint: 'Separación o posición incorrecta' },
  ],
  masonry: [
    { id: 'cracks', label: 'Fisuras o grietas', hint: 'Diagonales, verticales, horizontales o escalonadas' },
    { id: 'broken_units', label: 'Unidades rotas o aplastadas', hint: 'Ladrillos o bloques fracturados o sueltos' },
    { id: 'mortar_loss', label: 'Deterioro de juntas', hint: 'Pérdida, erosión o separación del mortero' },
    { id: 'wall_separation', label: 'Separación muro–estructura', hint: 'Abertura en encuentros, bordes o juntas' },
    { id: 'moisture', label: 'Humedad o eflorescencia', hint: 'Filtraciones, manchas o depósitos de sales' },
    { id: 'plumb', label: 'Desplome (vertical)', hint: 'Inclinación del muro respecto de la vertical' },
    { id: 'level', label: 'Desnivel (horizontal)', hint: 'Diferencia de cota o pendiente no prevista' },
    { id: 'confinement', label: 'Daño en confinamiento', hint: 'Deficiencia en columnetas, vigas o amarres' },
    { id: 'unplanned_opening', label: 'Vano o intervención no previsto', hint: 'Perforaciones, rozas o retiro de unidades' },
  ],
  earth: [
    { id: 'cracks', label: 'Fisuras o grietas', hint: 'Abertura, patrón y extensión visibles' },
    { id: 'erosion', label: 'Erosión o lavado', hint: 'Pérdida superficial por agua, viento o roce' },
    { id: 'material_loss', label: 'Pérdida de material', hint: 'Desintegración, cavidades o reducción de sección' },
    { id: 'moisture', label: 'Humedad', hint: 'Manchas, filtración, ascenso capilar o reblandecimiento' },
    { id: 'settlement', label: 'Asentamiento', hint: 'Descenso o movimiento diferencial observable' },
    { id: 'plumb', label: 'Desplome (vertical)', hint: 'Inclinación respecto de la vertical' },
    { id: 'level', label: 'Desnivel (horizontal)', hint: 'Diferencia de cota o pendiente no prevista' },
    { id: 'connection', label: 'Falla en encuentro o amarre', hint: 'Separación en esquinas, diafragmas o conexiones' },
    { id: 'biological', label: 'Daño biológico', hint: 'Vegetación, insectos u otros agentes visibles' },
  ],
  wood: [
    { id: 'rot', label: 'Pudrición o degradación', hint: 'Cambio de textura, color o pérdida de consistencia' },
    { id: 'moisture', label: 'Humedad', hint: 'Filtración, manchas o contacto permanente con agua' },
    { id: 'insects', label: 'Ataque de insectos', hint: 'Orificios, galerías, polvo o presencia de xilófagos' },
    { id: 'cracks', label: 'Grietas o rajaduras', hint: 'Separación de fibras o fisuración longitudinal' },
    { id: 'section_loss', label: 'Pérdida de sección', hint: 'Desgaste, corte o deterioro localizado' },
    { id: 'deformation', label: 'Deformación o alabeo', hint: 'Flecha, torsión o curvatura visible' },
    { id: 'plumb', label: 'Desplome (vertical)', hint: 'Inclinación respecto de la vertical' },
    { id: 'connection', label: 'Daño en conexiones', hint: 'Clavos, pernos, placas o ensambles deficientes' },
    { id: 'fire', label: 'Daño por fuego o temperatura', hint: 'Carbonización, cambio de color o pérdida superficial' },
  ],
  other: [
    { id: 'discontinuity', label: 'Fisura, grieta o discontinuidad', hint: 'Abertura o separación visible' },
    { id: 'surface', label: 'Deterioro superficial', hint: 'Desgaste, desprendimiento o alteración del acabado' },
    { id: 'deformation', label: 'Deformación', hint: 'Cambio visible de forma, alineación o geometría' },
    { id: 'section_loss', label: 'Pérdida de sección o material', hint: 'Reducción localizada o generalizada' },
    { id: 'moisture', label: 'Humedad o filtración', hint: 'Presencia de agua, manchas o depósitos' },
    { id: 'connection', label: 'Daño en unión o apoyo', hint: 'Holgura, separación, rotura o fijación deficiente' },
    { id: 'impact', label: 'Daño por impacto', hint: 'Golpe, rotura o afectación localizada' },
    { id: 'other', label: 'Otra anomalía', hint: 'Hallazgo que requiere descripción complementaria' },
  ],
};

export const CONDITION_LABELS: Record<number, string> = {
  1: 'Muy bueno',
  2: 'Bueno',
  3: 'Regular',
  4: 'Malo',
  5: 'Crítico',
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: '1 – Muy leve',
  2: '2 – Leve',
  3: '3 – Moderado',
  4: '4 – Severo',
  5: '5 – Crítico',
};
