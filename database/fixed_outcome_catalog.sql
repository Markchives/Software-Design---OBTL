-- Add the fixed SO codes without changing or deleting existing legacy outcomes.
-- The project has not supplied official SO descriptions, so new rows use their
-- code as a neutral display value until canonical descriptions are provided.
-- Run this once in the Supabase SQL editor for each existing environment.
INSERT INTO public.student_outcomes (code, description)
VALUES
    ('SO(A)', 'SO(A)'), ('SO(B)', 'SO(B)'), ('SO(C)', 'SO(C)'),
    ('SO(D)', 'SO(D)'), ('SO(E)', 'SO(E)'), ('SO(F)', 'SO(F)'),
    ('SO(G1)', 'SO(G1)'), ('SO(G2)', 'SO(G2)'), ('SO(H)', 'SO(H)'),
    ('SO(I)', 'SO(I)'), ('SO(J)', 'SO(J)'), ('SO(K)', 'SO(K)'),
    ('SO(L)', 'SO(L)')
ON CONFLICT (code) DO NOTHING;

UPDATE public.course_outcomes
SET description = CASE code
    WHEN 'CO1' THEN 'Evaluate how personal, family, and community values, morals, and ethics influence professional behavior and decision-making in IT.'
    WHEN 'CO2' THEN 'Create strategies that demonstrate proper conduct, responsibility, and accountability in IT practice, guided by professional codes of ethics (e.g., ACM, IEEE, PSIA, PCS).'
    WHEN 'CO3' THEN 'Analyze ethical dilemmas in computing, such as privacy versus security, whistleblowing, and conflicts of interest, and justify resolutions using established ethical frameworks.'
    WHEN 'CO4' THEN 'Evaluate Philippine IT-related laws and policies, including the Data Privacy Act (RA 10173), the Cybercrime Prevention Act (RA 10175), and the E-Commerce Act (RA 8792), and justify their correct application in real-world scenarios.'
    WHEN 'CO5' THEN 'Assess intellectual property frameworks (copyright, patents, trademarks, software licensing, and open source) and justify their proper application to software, digital content, and IT innovations.'
    WHEN 'CO6' THEN 'Evaluate data privacy and electronic transaction scenarios for legal compliance, and recommend corrective measures that protect data subjects and organizations.'
    WHEN 'CO7' THEN 'Evaluate contemporary IT issues, such as AI ethics, cybersecurity threats, the digital divide, misinformation, and environmental impact, for their effects on individuals, organizations, and society.'
    WHEN 'CO8' THEN 'Design lifelong learning strategies (certifications, continuing education, professional networks, and portfolio building) that keep IT skills current in a rapidly changing industry.'
    WHEN 'CO9' THEN 'Evaluate business and management trade-offs in IT decisions, such as cost versus quality, speed versus security, and profit versus social responsibility, and justify informed decisions.'
    WHEN 'CO10' THEN 'Justify IT decisions and recommendations that balance technical, ethical, legal, and societal considerations, and communicate them effectively as an accountable professional.'
END,
updated_at = NOW()
WHERE code IN ('CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6', 'CO7', 'CO8', 'CO9', 'CO10');
