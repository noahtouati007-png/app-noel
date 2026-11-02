// =============================================================
//  CONFIG — Roue de Noël Galzin
//  C'est le seul fichier à modifier pour brancher / ajuster l'appli.
// =============================================================
window.ROUE_CONFIG = {
  // Supabase (URL + clé "publishable"/anon). Laisser vide = MODE DÉMO
  // (tirage local, rien n'est enregistré, utile pour tester le design).
  supabaseUrl: "https://bfqndpghostgvxgxrtte.supabase.co",
  supabaseKey: "sb_publishable_EjYE0Gbxt-K6C8vNFsFhKg_OU-9rJW2", // clé publique (faite pour être dans le navigateur)

  // QR code à faire scanner en caisse (fourni par Galzin).
  // Remplacer le fichier public/assets/img/qr-caisse.svg (ou .png) et mettre le chemin ici.
  qrCaisse: "assets/img/qr-caisse.svg",

  // Validité affichée sur l'écran gagnant
  validite: "Valable aujourd'hui uniquement, dans votre boutique Galzin",

  // Lien vers le règlement du jeu (PDF ou page)
  reglementUrl: "#reglement",

  // Lots utilisés UNIQUEMENT en mode démo.
  // En production, les lots viennent de la table Supabase "lots".
  lotsDemo: [
    { id: "pac20",     titre: "-20%",    sous_titre: "Pain au choc",   description: "-20 % sur vos pains au chocolat", couleur: "#572d14", poids: 25 },
    { id: "cafe",      titre: "OFFERT",  sous_titre: "Café",           description: "Un café offert",                  couleur: "#e2132b", poids: 20 },
    { id: "buche10",   titre: "-10%",    sous_titre: "Bûche de Noël",  description: "-10 % sur votre bûche de Noël",   couleur: "#c99a4a", poids: 12 },
    { id: "baguette",  titre: "OFFERTE", sous_titre: "Baguette",       description: "Une baguette tradition offerte",  couleur: "#3c1f0e", poids: 15 },
    { id: "croissant", titre: "OFFERT",  sous_titre: "Croissant",      description: "Un croissant offert",             couleur: "#e2132b", poids: 10 },
    { id: "choco",     titre: "OFFERT",  sous_titre: "Chocolat chaud", description: "Un chocolat chaud offert",        couleur: "#572d14", poids: 8 },
    { id: "pacoff",    titre: "OFFERT",  sous_titre: "Pain au choc",   description: "Un pain au chocolat offert",      couleur: "#c99a4a", poids: 7 },
    { id: "panier10",  titre: "-10%",    sous_titre: "Tout le panier", description: "-10 % sur tout votre panier",     couleur: "#3c1f0e", poids: 3 },
  ],
};
