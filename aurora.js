module.exports = async function handler(req, res) {
    try {
        const [magRes, plasmaRes, kpRes] = await Promise.all([
            fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-1-minute.json'),
            fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-minute.json'),
            fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
        ]);

        if (!magRes.ok || !plasmaRes.ok || !kpRes.ok) {
            throw new Error('NOAA servers responded with error');
        }

        const magData = await magRes.json();
        const plasmaData = await plasmaRes.json();
        const kpData = await kpRes.json();

        const latestMag = magData.length > 1 ? magData[magData.length - 1] : null;
        const latestPlasma = plasmaData.length > 1 ? plasmaData[plasmaData.length - 1] : null;
        const latestKp = kpData.length > 1 ? kpData[kpData.length - 1] : null;

        const bz = latestMag ? parseFloat(latestMag[3]) : 0;
        const speed = latestPlasma ? parseFloat(latestPlasma[2]) : 0;
        const density = latestPlasma ? parseFloat(latestPlasma[1]) : 0;
        const kp = latestKp ? parseFloat(latestKp[1]) : 0;

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        return res.status(200).json({ bz, speed, density, kp });
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Failed to fetch NOAA data' });
    }
};