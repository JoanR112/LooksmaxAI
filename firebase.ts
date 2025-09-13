import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyArb4OeD3Tblb6dXZQfPZxeZ4dFPNRklb4",
  authDomain: "looksmax-19ad2.firebaseapp.com",
  projectId: "looksmax-19ad2",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
