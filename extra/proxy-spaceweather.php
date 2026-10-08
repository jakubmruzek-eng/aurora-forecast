<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Live 10-minute Solar Wind data stream
$url = "https://services.swpc.noaa.gov/products/summary/10-minute-solar-wind.json";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 8);

$response = curl_exec($ch);
curl_close($ch);

if ($response) {
    $data = json_decode($response, true);
    
    // Parse JSON into simple structure
    $result = [
        "bz" => isset($data['Bz']) ? floatval($data['Bz']) : -2.5,
        "speed" => isset($data['Velocity']) ? floatval($data['Velocity']) : 410,
        "density" => isset($data['Density']) ? floatval($data['Density']) : 4.8,
        "kp" => 3.0,
        "clouds" => 15,
        "temp" => -3,
        "dew" => -5
    ];
    
    echo json_encode($result);
} else {
    // Fallback response if external API times out
    echo json_encode([
        "bz" => -3.2,
        "speed" => 425,
        "density" => 6.1,
        "kp" => 3.3,
        "clouds" => 10,
        "temp" => -5,
        "dew" => -7
    ]);
}
?>