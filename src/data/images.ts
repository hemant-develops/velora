// Centralized remote image URLs. Swap these for local/CDN assets later —
// every screen pulls images from here, never inline.
const u = (id: string) => `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

export const heroImages = {
  authHero: u('photo-1580273916550-e323be2ae537'), // dark sports car, coastal road
};

export const brandLogos: Record<string, string> = {
  tesla: u('photo-1617531653332-bd46c24f2068'),
  bmw: u('photo-1555215695-3004980ad54e'),
  lamborghini: u('photo-1544829099-b9a0c07fad1a'),
  honda: u('photo-1590362891991-f776e747a588'),
  ferrari: u('photo-1592198084033-aade902d1aae'),
  toyota: u('photo-1621007947382-bb3c3994e3fb'),
  mercedes: u('photo-1617814076367-b759c7d7e738'),
  audi: u('photo-1553440569-bcc63803a83d'),
  hyundai: u('photo-1602777624112-42a19caab449'),
  kia: u('photo-1619767886558-efdc259cde1a'),
  maruti: u('photo-1533473359331-0135ef1b58bf'),
  // Added for the Indian-market catalog cleanup — same placeholder-photo
  // approach as every brand above (this app has no licensed logo assets),
  // never a claimed "official" logo.
  tata: u('photo-1552519507-da3b142c6e3d'),
  mahindra: u('photo-1519641471654-76ce0107ad1b'),
  renault: u('photo-1503376780353-7e6692767b70'),
  nissan: u('photo-1541899481282-d53bffe3c35d'),
  mg: u('photo-1493238792000-8113da705763'),
  volkswagen: u('photo-1502877338535-766e1452684a'),
  skoda: u('photo-1554744512-d6c603f27c54'),
  jeep: u('photo-1519641471654-76ce0107ad1b'),
};

export const carImages: Record<string, string[]> = {
  altoK10: [u('photo-1533473359331-0135ef1b58bf'), u('photo-1502877338535-766e1452684a')],
  swift: [u('photo-1502877338535-766e1452684a'), u('photo-1533473359331-0135ef1b58bf')],
  hondaCity: [u('photo-1590362891991-f776e747a588'), u('photo-1552519507-da3b142c6e3d')],
  hyundaiCreta: [u('photo-1602777624112-42a19caab449'), u('photo-1493238792000-8113da705763')],
  kiaSeltos: [u('photo-1619767886558-efdc259cde1a'), u('photo-1519641471654-76ce0107ad1b')],
  innovaCrysta: [u('photo-1621007947382-bb3c3994e3fb'), u('photo-1493238792000-8113da705763')],
  fortuner: [u('photo-1621007947382-bb3c3994e3fb'), u('photo-1519641471654-76ce0107ad1b')],
  bmw3Series: [u('photo-1542362567-b07e54358753'), u('photo-1523983388277-336a66bae210')],
  bmw4Convertible: [u('photo-1523983388277-336a66bae210'), u('photo-1542362567-b07e54358753')],
  mercedesCClass: [u('photo-1617814076367-b759c7d7e738'), u('photo-1555215695-3004980ad54e')],
  audiQ5: [u('photo-1553440569-bcc63803a83d'), u('photo-1541899481282-d53bffe3c35d')],
  teslaModel3: [u('photo-1617531653332-bd46c24f2068'), u('photo-1554744512-d6c603f27c54')],
  lamborghiniRevuelto: [
    u('photo-1592198084033-aade902d1aae'),
    u('photo-1544829099-b9a0c07fad1a'),
    u('photo-1503376780353-7e6692767b70'),
  ],
  ferrariF8: [u('photo-1592198084033-aade902d1aae'), u('photo-1503376780353-7e6692767b70')],
};

export const avatars = {
  abhishek: u('photo-1633332755192-727a05c4013d'),
  support: u('photo-1573497019940-1c28c88b4f3e'),
  driver: u('photo-1560250097-0b93528c311a'),
  owner1: u('photo-1633332755192-727a05c4013d'),
  female1: u('photo-1494790108377-be9c29b29330'),
  male1: u('photo-1500648767791-00dcc994a43e'),
};
