-- AEGIS Transaction Code Permissions Seed Data
-- Reference: Used by Tier 1 Validation T-code policy check
-- access_level: employee (can execute), it-admin (admin access only), consultant (SAP consultant only)

-- Truncate and re-seed (idempotent)
TRUNCATE TABLE transaction_code_permissions;

INSERT INTO transaction_code_permissions (tcode, description, access_level, module) VALUES
-- ============================================================
-- SD Module — Employee accessible
-- ============================================================
('VA01', 'Create Sales Order', 'employee', 'SD'),
('VA02', 'Change Sales Order', 'employee', 'SD'),
('VA03', 'Display Sales Order', 'employee', 'SD'),
('VA31', 'Create Scheduling Agreement', 'employee', 'SD'),
('VA32', 'Change Scheduling Agreement', 'employee', 'SD'),
('VA33', 'Display Scheduling Agreement', 'employee', 'SD'),
('VL01N', 'Create Outbound Delivery', 'employee', 'SD'),
('VL02N', 'Change Outbound Delivery', 'employee', 'SD'),
('VL03N', 'Display Outbound Delivery', 'employee', 'SD'),
('VF01', 'Create Billing Document', 'employee', 'SD'),
('VF02', 'Change Billing Document', 'employee', 'SD'),
('VF03', 'Display Billing Document', 'employee', 'SD'),
('VF04', 'Maintain Billing Due List', 'employee', 'SD'),
('VF31', 'Output From Billing Documents', 'employee', 'SD'),
('VT01N', 'Create Shipment', 'employee', 'SD'),
('VT02N', 'Change Shipment', 'employee', 'SD'),

-- ============================================================
-- MM Module — Employee accessible
-- ============================================================
('ME21N', 'Create Purchase Order', 'employee', 'MM'),
('ME22N', 'Change Purchase Order', 'employee', 'MM'),
('ME23N', 'Display Purchase Order', 'employee', 'MM'),
('ME31K', 'Create Contract', 'employee', 'MM'),
('MIGO', 'Goods Movement (GR/GI/Transfer)', 'employee', 'MM'),
('MMBE', 'Stock Overview', 'employee', 'MM'),
('MB52', 'List of Warehouse Stocks on Hand', 'employee', 'MM'),
('MB25', 'Reservations List', 'employee', 'MM'),
('MB51', 'Material Document List', 'employee', 'MM'),
('ME2L', 'Purchase Orders by Vendor', 'employee', 'MM'),
('ME2M', 'Purchase Orders by Material', 'employee', 'MM'),
('ME29N', 'Release Purchase Order', 'employee', 'MM'),
('MIRO', 'Enter Incoming Invoice', 'employee', 'MM'),
('MM03', 'Display Material Master', 'employee', 'MM'),
('ME53N', 'Display Purchase Requisition', 'employee', 'MM'),

-- ============================================================
-- FI Module — Employee accessible (display/reporting only)
-- ============================================================
('FB03', 'Display Document', 'employee', 'FI'),
('FBL1N', 'Vendor Line Items', 'employee', 'FI'),
('FBL5N', 'Customer Line Items', 'employee', 'FI'),
('FBL3N', 'G/L Account Line Items', 'employee', 'FI'),
('FS10N', 'Balance Display for G/L Account', 'employee', 'FI'),
('F-28', 'Incoming Payments', 'employee', 'FI'),
('F-53', 'Post Outgoing Payments', 'employee', 'FI'),
('F-58', 'Payment with Printout', 'employee', 'FI'),

-- ============================================================
-- SD Module — IT Admin / Consultant only
-- ============================================================
('VKOA', 'Revenue Account Determination', 'it-admin', 'SD'),
('VD01', 'Create Customer Master', 'it-admin', 'SD'),
('VD02', 'Change Customer Master', 'it-admin', 'SD'),
('XD01', 'Create Customer (Full)', 'it-admin', 'SD'),
('XD02', 'Change Customer (Full)', 'it-admin', 'SD'),
('VOV8', 'Maintain Sales Document Types', 'consultant', 'SD'),
('VOV4', 'Assign Item Categories', 'consultant', 'SD'),
('OVXG', 'Maintain Shipping Conditions', 'consultant', 'SD'),

-- ============================================================
-- MM Module — IT Admin / Consultant only
-- ============================================================
('MM01', 'Create Material Master', 'it-admin', 'MM'),
('MM02', 'Change Material Master', 'it-admin', 'MM'),
('XK01', 'Create Vendor (Full)', 'it-admin', 'MM'),
('XK02', 'Change Vendor (Full)', 'it-admin', 'MM'),
('ME57', 'Assign and Process Requisitions', 'it-admin', 'MM'),

-- ============================================================
-- FI Module — IT Admin / Consultant only
-- ============================================================
('OB52', 'Maintain Posting Periods', 'it-admin', 'FI'),
('FTXP', 'Maintain Tax Codes', 'it-admin', 'FI'),
('OBD2', 'Financial Accounting Document Types', 'consultant', 'FI'),
('FS00', 'Create/Change G/L Account Centrally', 'it-admin', 'FI'),
('F110', 'Parameters for Automatic Payment', 'it-admin', 'FI'),
('FB60', 'Enter Vendor Invoice', 'it-admin', 'FI'),
('FB70', 'Enter Customer Invoice', 'it-admin', 'FI'),

-- ============================================================
-- BASIS / System — Consultant only
-- ============================================================
('SE11', 'ABAP Dictionary', 'consultant', 'BASIS'),
('SE16', 'Data Browser', 'consultant', 'BASIS'),
('SE38', 'ABAP Editor', 'consultant', 'BASIS'),
('SM30', 'Table Maintenance', 'consultant', 'BASIS'),
('SU01', 'User Maintenance', 'it-admin', 'BASIS'),
('SPRO', 'SAP Customizing', 'consultant', 'BASIS'),
('SM50', 'Work Process Overview', 'it-admin', 'BASIS'),
('SM51', 'List of SAP Servers', 'it-admin', 'BASIS'),
('ST05', 'Performance Trace', 'consultant', 'BASIS');
