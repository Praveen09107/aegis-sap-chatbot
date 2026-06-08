-- AEGIS Synonym Map Initial Seed Data
-- Maps common employee phrasings to SAP technical terminology
-- Used by the Query Intelligence Layer synonym expansion stage

-- Truncate and re-seed (idempotent)
TRUNCATE TABLE synonym_map;

INSERT INTO synonym_map (phrase, expansion, created_by) VALUES
-- ============================================================
-- SD Module synonyms
-- ============================================================
('delivery blocked', 'outbound delivery creation error VL01N VL150 material available stock inventory', 'system'),
('delivery error', 'outbound delivery creation VL01N delivery document error', 'system'),
('delivery stuck', 'outbound delivery creation blocked VL01N VL150 material availability', 'system'),
('zero stock', 'material availability stock 0 EA VL150 MMBE inventory unrestricted', 'system'),
('stock showing zero', 'material availability 0 EA VL150 safety stock reservation MMBE', 'system'),
('delivery creation', 'outbound delivery VL01N create delivery SD', 'system'),
('billing error', 'billing document VF01 FI account determination error SD', 'system'),
('billing blocked', 'billing document VF01 blocked account determination G/L account SD FI', 'system'),
('invoice not created', 'billing document not created VF01 FI accounting document error', 'system'),
('accounting document', 'FI accounting document billing VF01 G/L account determination', 'system'),
('scheduling agreement', 'scheduling agreement VA31 VA32 YDSA delivery schedule SD', 'system'),
('incompletion log', 'incompletion log procedure incomplete SD scheduling agreement delivery', 'system'),
('sales order blocked', 'sales order blocked VA01 VA02 delivery blocked SD', 'system'),

-- ============================================================
-- MM Module synonyms
-- ============================================================
('goods receipt', 'goods receipt MIGO movement type 101 MM material document GR', 'system'),
('goods issue', 'goods issue MIGO movement type 601 VL02N delivery SD MM', 'system'),
('purchase order', 'purchase order ME21N ME22N PO MM procurement', 'system'),
('po blocked', 'purchase order blocked ME21N MM approval workflow', 'system'),
('invoice verification', 'invoice verification MIRO FI vendor invoice MM', 'system'),
('material not available', 'material availability VL150 stock unrestricted safety stock reservation', 'system'),
('stock discrepancy', 'stock overview MMBE MB52 inventory discrepancy material', 'system'),
('reservation blocking', 'reservation MB25 blocking stock VL150 MM SD', 'system'),

-- ============================================================
-- FI Module synonyms
-- ============================================================
('posting period', 'posting period OB52 FI fiscal year period open closed', 'system'),
('period closed', 'posting period closed OB52 FI cannot post document', 'system'),
('withholding tax', 'withholding tax FTXP FI tax code configuration', 'system'),
('payment run', 'payment run F110 FI automatic payment vendor outgoing payment', 'system'),
('account assignment', 'G/L account assignment determination VKOA FI SD revenue', 'system');
