export default {
  content: ["./index.html","./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {
    colors: { paper: "#FAF9F6", water: "#A3D5FF", cream: "#f0ebe0", nav: "#7a9db0", dark: "#2d3f4a" },
    backgroundImage: { "paper-texture":"url('/textures/paper.png')" },
  }},
  plugins: [],
}
