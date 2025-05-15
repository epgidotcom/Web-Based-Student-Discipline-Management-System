export default function handler(req, res) {
  if (req.method === 'POST') {
    // You can check credentials here if you want
    // For now, just return success
    return res.status(200).json({ success: true, message: "Login successful" });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}