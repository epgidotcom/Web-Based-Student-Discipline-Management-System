// Very lightweight in-memory rate limiter (suitable only for single-instance dev/testing)
const buckets = new Map();

export function rateLimit({ key = (req)=> req.ip, windowMs = 60_000, max = 60 } = {}){
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let b = buckets.get(k);
    if(!b || b.reset < now){ b = { count:0, reset: now + windowMs }; buckets.set(k,b); }
    b.count++;
    if(b.count > max){
      const retry = Math.ceil((b.reset - now)/1000);
      res.setHeader('Retry-After', retry);
      return res.status(429).json({ error: 'Too many requests', retry_after: retry });
    }
    next();
  };
}
