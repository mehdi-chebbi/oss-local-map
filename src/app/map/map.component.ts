import { Component, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import {MatDatepickerInputEvent} from "@angular/material/datepicker";
import {timer} from "rxjs";
import Swal from 'sweetalert2';
import {DomSanitizer} from "@angular/platform-browser";
import {HttpClient} from "@angular/common/http";
import flatpickr from "flatpickr";
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale);


interface Product {
  Name: string;
  Id: any;
  ContentLength: number;
  PublicationDate: any;
  GeoFootprint?: {
    coordinates: number[][][];
  };
}

interface FetchedProduct {
  id: any;
  name: string;
  contentLength: string;
  publish_date: any;
  coordinates: string; // Store coordinates as a string
}

interface LatLng {
  lat: number;
  lng: number;
}
type PolygonCoordinates = LatLng[][];
type TransformedCoordinates = number[][][];

interface ODataResponse {
  value: Product[];
  "@odata.nextLink"?: string;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements AfterViewInit {
  fetchedProductNames: FetchedProduct[] = [];
  isSidebarHidden: boolean = true;
  drawnItems: L.FeatureGroup = new L.FeatureGroup();
  startDate!: string;
  endDate!: string;
  isLoading: boolean = false;
  productCount: number = 0;
  dateOption: string = '';
  collectionType: string = '1'; // Default to Sentinel-2
  sentinel1ProductType: string = 'RAW'; // Default product type for Sentinel-1
  sentinel2ProductType: string = 'S2MSI2A'; // Default product type for Sentinel-2
  sentinel3ProductType: string = 'OL_1_EFR___'; // Default product type for Sentinel-3
  polygonMap: Map<any, L.Polygon> = new Map(); // Map to track polygons by product ID
  map!: L.Map;
  private ndviLayer?: L.TileLayer.WMS;
  private trueColorLayer?: L.TileLayer.WMS;
  private Natural_Color?: L.TileLayer.WMS;
  private FALSE_COLOR?: L.TileLayer.WMS;
  private MOISTURE_INDEX?: L.TileLayer.WMS;
  private False_Color_Urban?: L.TileLayer.WMS;
  private SWIR?: L.TileLayer.WMS;
  private NDWI?: L.TileLayer.WMS;
  private NDSI?: L.TileLayer.WMS;
  private SCM?: L.TileLayer.WMS;
  wmsBaseUrl = 'https://sh.dataspace.copernicus.eu/ogc/wms/e240412d-16d7-4976-90d1-008f5a0061ff';
  timeParam: string = new Date().toISOString().split('T')[0];
  wmsUrl = `${this.wmsBaseUrl}?TIME=${this.timeParam}`; // Append TIME parameter to the URL
  activeOverlayLayers: Set<L.Layer> = new Set<L.Layer>();
  minDate = new Date(2015, 0, 1); // January 1, 2016
  maxDate=new Date();
  minDatepicker = new Date(2016, 9, 20); // January 1, 2016
  maxDatepicker=new Date();
  years: number[] = [];
  startYear: number | null = null;
  endYear: number | null = null;
  currentLayer: string | null = "none";  // Variable to store the current layer
  ip_display = 'http://172.24.198.158:8080';
  ip_server = 'http://127.0.0.1:5000';

  NdviLegend: any = `<!DOCTYPE html>
  <html>
  <head>
  <style>
  table {
    border-collapse: collapse;
    width: 100%; /* Adjust the width as needed */
    margin: 0 auto; /* Center the table */
  }

  th, td {
    text-align: left;
    padding: 1px 2px; /* Further reduced padding */
    border: 1px solid black;
  }

  th {
    background-color: #f2f2f2;
  }

  tr {
    height: 20px; /* Reduced row height */
  }
  </style>
  </head>
  <body>

  <table>
    <tr>
      <th>NDVI Range</th>
      <th>Color</th>
    </tr>
    <tr>
      <td>NDVI < -0.5</td>
      <td style="background-color: #0c0c0c;"></td>
    </tr>
    <tr>
      <td>-0.5 < NDVI ≤ 0</td>
      <td style="background-color: #eaeaea;"></td>
    </tr>
    <tr>
      <td>0 < NDVI ≤ 0.1</td>
      <td style="background-color: #ccc682;"></td>
    </tr>
    <tr>
      <td>0.1 < NDVI ≤ 0.2</td>
      <td style="background-color: #91bf51;"></td>
    </tr>
    <tr>
      <td>0.2 < NDVI ≤ 0.3</td>
      <td style="background-color: #70a33f;"></td>
    </tr>
    <tr>
      <td>0.3 < NDVI ≤ 0.4</td>
      <td style="background-color: #4f892d;"></td>
    </tr>
    <tr>
      <td>0.4 < NDVI ≤ 0.5</td>
      <td style="background-color: #306d1c;"></td>
    </tr>
    <tr>
      <td>0.5 < NDVI ≤ 0.6</td>
      <td style="background-color: #0f540a;"></td>
    </tr>
    <tr>
      <td>0.6 < NDVI ≤ 1.0</td>
      <td style="background-color: #004400;"></td>
    </tr>
  </table>

  </body>
  </html>`;
  MoistureLegend: any = `
<table style="border-collapse: collapse; width: 100%; margin: 0 auto;">
  <tr>
    <th style="text-align: left; padding: 1px 2px; border: 1px solid black; background-color: #f2f2f2;">Moisture Range</th>
    <th style="text-align: left; padding: 1px 2px; border: 1px solid black; background-color: #f2f2f2;">Color</th>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">−0.8< NDMI <−0.24</td>
    <td style="background-color: #800000; width: 100px; height: 20px;"></td>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">−0.24< NDMI <−0.032</td>
    <td style="background-color: #ff0000; width: 100px; height: 20px;"></td>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">−0.032< NDMI <0.032</td>
    <td style="background-color: #ffff00; width: 100px; height: 20px;"></td>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">0.032< NDMI <0.24</td>
    <td style="background-color: #00ffff; width: 100px; height: 20px;"></td>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">0.24< NDMI <0.8</td>
    <td style="background-color: #0000ff; width: 100px; height: 20px;"></td>
  </tr>
  <tr>
    <td style="text-align: left; padding: 1px 2px; border: 1px solid black;">0.24< NDMI <0.8</td>
    <td style="background-color: #000080; width: 100px; height: 20px;"></td>
  </tr>
</table>
`;
  FalseColorsLegend: any= `<!DOCTYPE html>
<html>
<head>
<style>
table {
  border-collapse: collapse;
  width: 100%; /* Adjust the width as needed */
  margin: 0 auto; /* Center the table */
}

th, td {
  text-align: left;
  padding: 1px 2px; /* Further reduced padding */
  border: 1px solid black;
}

th {
  background-color: #f2f2f2;
}

tr {
  height: 20px; /* Reduced row height */
}
</style>
</head>
<body>
<table>
  <tr>
    <th>Description</th>
    <th>Color</th>
  </tr>
  <tr>
    <td>Healthy Vegetation</td>
    <td style="background-color: #ff0000;"></td>
  </tr>
  <tr>
    <td>Stressed Vegetation</td>
    <td style="background-color: #ffff00;"></td>
  </tr>
  <tr>
    <td>Water bodies</td>
    <td style="background-color: #0000ff;"></td>
  </tr>
  <tr>
    <td>Urban Areas</td>
    <td style="background-color: #808080;"></td>
  </tr>
   <tr>
    <td>Bare Soil and Rocks</td>
    <td style="background-color: #d2b48c;"></td>
  </tr>
</table>

</body>
</html>
`;
  FalseColorsUrbanLegend: any= `<!DOCTYPE html>
<html>
<head>
<style>
table {
  border-collapse: collapse;
  width: 100%; /* Adjust the width as needed */
  margin: 0 auto; /* Center the table */
}

th, td {
  text-align: left;
  padding: 1px 2px; /* Further reduced padding */
  border: 1px solid black;
}

th {
  background-color: #f2f2f2;
}

tr {
  height: 20px; /* Reduced row height */
}
</style>
</head>
<body>
<table>
  <tr>
    <th>Description</th>
    <th>Color</th>
  </tr>
<tr>
    <td>Urban Areas</td>
    <td style="background-color: #ff0000;"></td> <!-- Bright Red -->
  </tr>
  <tr>
    <td>Vegetation</td>
    <td style="background-color: #00ff00;"></td> <!-- Bright Green -->
  </tr>
  <tr>
    <td>Water Bodies</td>
    <td style="background-color: #0000ff;"></td> <!-- Blue -->
  </tr>
  <tr>
    <td>Bare Soil/Rocky Areas</td>
    <td style="background-color: #a0522d;"></td> <!-- Brown -->
  </tr>
</table>

</body>
</html>
`;
  ndviResults: { [key: string]: number | { error: string, status_code: number, response: string } } = {};

  private apiUrl = 'http://localhost:5000/ndvi';  // URL to your Flask server
  dataReceived: boolean = false;

  fetchNdviData(coords: number[][][]): void {
    // Indicate that data is not yet received
    this.dataReceived = false;

    this.http.post<{ [key: string]: number | { error: string, status_code: number, response: string } }>(this.apiUrl, { coordinates: coords })
      .subscribe(
        (data) => {
          this.ndviResults = data;
          this.dataReceived = true; // Data has been received
          console.log(this.ndviResults);  // Log the results for debugging
        },
        (error) => {
          console.error('Error fetching NDVI data', error);
        }
      );
  }
  showChartAlert() {
    // Check if the NDVI results are empty
    if (Object.keys(this.ndviResults).length === 0) {
      Swal.fire({
        title: 'No NDVI Data Available',
        text: 'No NDVI data was retrieved. Please draw a region to get the data.',
        icon: 'warning',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Check if there is at least one error in the NDVI results
    const hasError = Object.values(this.ndviResults).some(result =>
      typeof result === 'object' && result !== null && 'error' in result
    );

    if (hasError) {
      Swal.fire({
        title: 'NDVI Time Series Analysis Error',
        text: 'Failed to retrieve NDVI data for the selected period. Please choose a smaller region or adjust your request settings.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } else {
      Swal.fire({
        title: 'NDVI Time Series Analysis',
        html: `
    <div style="position: relative; max-width: 100%;">
      <canvas id="ndviChart" style="max-width: 100%;"></canvas>


    </div>
  `,
        width: '800px',  // Adjusted width for better visibility
        didOpen: () => {
          const ctx = (document.getElementById('ndviChart') as HTMLCanvasElement).getContext('2d');
          if (ctx) {
            const rawLabels = Object.keys(this.ndviResults);
            const chartData = Object.values(this.ndviResults).map(value => {
              // Convert values to chart data; handle errors as null
              if (typeof value === 'object' && value !== null && 'error' in value) {
                return null;
              }
              return value as number;
            });

            // Format the date labels
            const labels = rawLabels.map(dateStr => {
              const [year, month] = dateStr.split('-').map(Number);
              return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: 'numeric' });
            });

            new Chart(ctx, {
              type: 'line',
              data: {
                labels: labels,
                datasets: [{
                  label: 'NDVI Value',
                  data: chartData,
                  borderColor: 'rgba(34, 202, 236, 1)', // Updated color
                  backgroundColor: 'rgba(34, 202, 236, 0.2)', // Updated color
                  fill: true,
                  tension: 0.3 // Slightly higher tension for smoother curves
                }]
              },
              options: {
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top',
                    labels: {
                      font: {
                        size: 14
                      }
                    }
                  },
                  title: {
                    display: true,
                    text: 'NDVI Over Time',
                    font: {
                      size: 18
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        const label = context.dataset.label || '';
                        // Ensure context.raw is a number
                        const value = (context.raw as number).toFixed(2);
                        return `${label}: ${value}`;
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: 'Date',
                      font: {
                        size: 14
                      }
                    }
                  },
                  y: {
                    title: {
                      display: true,
                      text: 'NDVI Value',
                      font: {
                        size: 14
                      }
                    }
                  }
                }
              }
            });
          }
        }
      });

    }
  }




  toggleSidebar() {
    this.isSidebarHidden = !this.isSidebarHidden;
  }

  constructor(private sanitizer: DomSanitizer,private http: HttpClient) {
    const currentYear = new Date().getFullYear();
    // Populate years from 2016 to current year
    for (let year = 2016; year <= currentYear; year++) {
      this.years.push(year);
    }
    this.MoistureLegend=this.sanitizer.bypassSecurityTrustHtml(this.MoistureLegend)
    this.NdviLegend=this.sanitizer.bypassSecurityTrustHtml(this.NdviLegend)
    this.FalseColorsUrbanLegend=this.sanitizer.bypassSecurityTrustHtml(this.FalseColorsUrbanLegend)
    this.FalseColorsLegend=this.sanitizer.bypassSecurityTrustHtml(this.FalseColorsLegend)
  }
  drawPolygonFromCoords(productId: any, coordsString: string) {
    // Check if the polygon is already drawn
    if (this.polygonMap.has(productId)) {
      // Remove the existing polygon from the map
      const existingPolygon = this.polygonMap.get(productId);
      if (existingPolygon) {
        this.drawnItems.removeLayer(existingPolygon);
        this.polygonMap.delete(productId); // Remove from the map
      }
      return; // Exit the method
    }

    const coordsArray = coordsString.split(',').map(Number);
    const latLngs: L.LatLngExpression[] = [];

    for (let i = 0; i < coordsArray.length; i += 2) {
      latLngs.push([coordsArray[i + 1], coordsArray[i]]);
    }

    // Ensure the polygon is closed
    if (latLngs[0] !== latLngs[latLngs.length - 1]) {
      latLngs.push(latLngs[0]);
    }

    const polygon = L.polygon(latLngs, {
      color: 'red',
      weight: 3,
      opacity: 0.7,
      fillColor: '#ff7800',
      fillOpacity: 0.5
    }).addTo(this.drawnItems);

    this.polygonMap.set(productId, polygon); // Track the new polygon

    // Zoom to the polygon's bounds
    const bounds = polygon.getBounds();
    this.map.fitBounds(bounds);
  }



   transformCoordinates(coords: PolygonCoordinates): TransformedCoordinates {
    return coords.map(polygon => {
      // Get the transformed coordinates
      const transformedPolygon = polygon.map((point: LatLng) => [point.lng, point.lat]);

      // Ensure the polygon is closed by appending the first point to the end
      if (transformedPolygon.length > 0) {
        transformedPolygon.push(transformedPolygon[0]);
      }

      return transformedPolygon;
    });
  }


  downloadProductonServer(productId: any): Promise<void> {
    const downloadUrl = `${this.ip_server}/download-on-server/${productId}`;
    let eventSource: EventSource;

    return new Promise((resolve, reject) => {
      // Show SweetAlert2 loading modal with progress bar, percentage, and cancel button
      Swal.fire({
        title: 'Downloading...',
        html: `
            <div style="width: 100%; background: #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
              <div id="progress-bar" style="width: 0; height: 20px; background: #76c7c0; display: flex; align-items: center; justify-content: center; color: white;"></div>
            </div>
            Downloaded: <b id="downloaded">0</b> / <b id="total">0</b><br>
            Remaining time: <b id="remaining">0</b>
            <br><button id="cancel-button" class="swal2-cancel swal2-styled">Cancel</button>
          `,
        showConfirmButton: false,
        width: '600px',
        didOpen: () => {
          Swal.showLoading();

          // Set up the event source
          eventSource = new EventSource(downloadUrl);

          eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.status === 'complete') {
              Swal.close();
              eventSource.close(); // Close the SSE connection
              resolve();
            } else {
              // Update the SweetAlert2 modal content using direct DOM manipulation
              const downloadedElem = document.getElementById('downloaded');
              const totalElem = document.getElementById('total');
              const remainingElem = document.getElementById('remaining');
              const progressBarElem = document.getElementById('progress-bar');

              if (downloadedElem && totalElem && remainingElem && progressBarElem) {
                downloadedElem.textContent = this.formatBytes(data.downloaded);
                totalElem.textContent = this.formatBytes(data.total);
                remainingElem.textContent = this.formatTime(data.remaining_time);

                // Update progress bar width and percentage
                const progressPercentage = (data.downloaded / data.total) * 100;
                progressBarElem.style.width = `${progressPercentage}%`;
                progressBarElem.textContent = `${progressPercentage.toFixed(2)}%`;
              }
            }
          };

          // Handle cancel button click
          const cancelButton = document.getElementById('cancel-button');
          cancelButton?.addEventListener('click', () => {
            fetch(`http://localhost:5000/cancel-download/${productId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            })
              .then(response => {
                if (response.ok) {
                  console.log('Download cancelled successfully');
                  // Close the SSE connection after cancellation
                  eventSource.close();
                  Swal.close(); // Close the SweetAlert2 modal
                } else {
                  console.error('Failed to cancel download');
                }
              })
              .catch(error => {
                console.error('Error:', error);
              });
          });

        }
      });
    });
  }

  formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? hrs + 'h ' : ''}${mins > 0 ? mins + 'm ' : ''}${secs}s`;
  }
  downloadProduct(productId: any) {
    const downloadUrl = `http://localhost:5000/download/${productId}`;

    fetch(downloadUrl)
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(error => {
        console.error('Error downloading product:', error);
      });
  }
  async downloadAndProcess(productId: string, productName: string) {
    try {
      await this.downloadProductonServer(productId); // Wait for the download to complete

      await this.http.get(`${this.ip_server}/process-image?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing started.');
    } catch (err) {
      console.error('Error occurred:', err);
    }
  }
  async downloadAndProcessNDVI(productId: string, productName: string) {
    try {
      await this.downloadProductonServer(productId); // Wait for the download to complete

      await this.http.get(`${this.ip_server}/process-ndvi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing started.');
    } catch (err) {
      console.error('Error occurred:', err);
    }
  }
  async downloadAndProcessSAVI(productId: string, productName: string) {
    try {
      await this.downloadProductonServer(productId); // Wait for the download to complete

      await this.http.get(`${this.ip_server}/process-savi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing started.');
    } catch (err) {
      console.error('Error occurred:', err);
    }
  }
  async downloadAndProcessMSAVI(productId: string, productName: string) {
    try {
      await this.downloadProductonServer(productId); // Wait for the download to complete

      await this.http.get(`${this.ip_server}/process-msavi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing started.');
    } catch (err) {
      console.error('Error occurred:', err);
    }
  }
  async downloadAndProcessMSAVI2(productId: string, productName: string) {
    try {
      await this.downloadProductonServer(productId); // Wait for the download to complete

      await this.http.get(`${this.ip_server}/process-msavi2?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing started.');
    } catch (err) {
      console.error('Error occurred:', err);
    }
  }
  async ProcessNDVI(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-ndvi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }
  async ProcessLAI(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-lai?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }
  async ProcessTCI(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-image?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }

  async ProcessSAVI(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-savi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }
  async ProcessMSAVI(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-msavi?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }
  async ProcessMSAVI2(productName: string) {
    try {
      // Show the loading message
      Swal.fire({
        title: 'Processing...',
        text: 'Please wait while the image is being processed.',
        allowOutsideClick: false, // Prevent closing the alert by clicking outside
        didOpen: () => {
          Swal.showLoading(); // Show loading spinner
        }
      });

      console.log('Image processing started.');
      await this.http.get(`${this.ip_server}/process-msavi2?imgName=${encodeURIComponent(productName)}`).toPromise();
      console.log('Image processing complete.');

      // Close the loading message
      Swal.close();
    } catch (err) {
      console.error('Error occurred:', err);

      // Close the loading message and show an error message
      Swal.close();
      Swal.fire({
        title: 'Error!',
        text: 'An error occurred while processing the image.',
        icon: 'error'
      });
    }
  }
  ngAfterViewInit(): void {
    this.map = L.map('map', {
      center: [26.8206, 8.6537],
      zoom: 4,
      minZoom: 4,
      maxBounds: [
        [-35.0, -20.0],
        [38.0, 55.0]
      ],
      maxBoundsViscosity: 1.0
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    });

    L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false,
      maxWidth: 100
    }).addTo(this.map);
    osmLayer.addTo(this.map);



    fetch('assets/custom.geo (1).json')
      .then(response => response.json())
      .then(data => {
        const bordersLayer = L.geoJSON(data, {
          style: {
            color: 'grey',
            weight: 1,
            opacity: 0.8,
            fillColor: '#ffffff',
            fillOpacity: 0.9
          }
        });

        bordersLayer.addTo(this.map);
      });

    const anotherGeoJsonLayerGroup = L.layerGroup();

    fetch('assets/custom.geo.json')
      .then(response => response.json())
      .then(data => {
        const anotherLayer = L.geoJSON(data, {
          style: {
            color: 'grey',
            weight: 2,
            opacity: 0.7,
            fillColor: '#00ff00',
            fillOpacity: 0
          }
        });

        anotherGeoJsonLayerGroup.addLayer(anotherLayer);
      });

    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { shapeOptions: { color: 'blue', weight: 5 } },
        polyline: { shapeOptions: { color: 'blue', weight: 5 } },
        rectangle: false,
        circle: { shapeOptions: { color: 'blue', weight: 5 } },
        marker: false
      },
      edit: {
        featureGroup: this.drawnItems,
        remove: true
      }
    });
    this.map.addControl(drawControl);

    this.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = event.layer;
      this.drawnItems.addLayer(layer);
      // Check if the drawn shape is a polygon or polyline and get its coordinates
      if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
        const rawCoordinates = layer.getLatLngs();
        console.log('Raw Polygon/Polyline coordinates:', rawCoordinates);

        // Transform the coordinates
        const transformedCoordinates = this.transformCoordinates(rawCoordinates as PolygonCoordinates);
        this.fetchNdviData(transformedCoordinates);
        console.log('Transformed Polygon/Polyline coordinates:', transformedCoordinates);
      }
    });

    this.map.on(L.Draw.Event.DELETED, (event) => {
      this.fetchedProductNames = [];
      this.productCount = 0;  // Reset product count
    });

    const baseLayers = {
      "OpenStreetMap": osmLayer
    };

    const overlayLayers = {


    };

    L.control.layers(baseLayers, overlayLayers).addTo(this.map);



  }
  async showImage(productName: string, productId: string): Promise<void> {
    const imageUrl = `${this.ip_display}/${productName}.png`;

    this.http.head(imageUrl).subscribe({
      next: () => {
        // If the image exists, show the SweetAlert modal
        Swal.fire({
          width: '1000px', // Adjust width to fit both image and calendar
          title: `Image - ID: ${productName}`,
          html: `
          <div style="display: flex; align-items: center;">
            <div id="image-map-${productName}" style="height: 510px; width: 510px;margin-bottom: 250px"></div>
            <div style="margin-left: 20px;margin-bottom: 450px">
              <input type="text" id="date-picker" style="width: 200px;" />
               <div style="margin-top: 20px; border: 1px solid #ddd; width: 250px;">
                <div style="background-color: #007bff; color: #fff; padding: 10px; font-weight: bold;">LAYERS:</div>
                <div style="padding: 10px; border-top: 1px solid #ddd;">
                  <div id="layer-ndvi" style="display: flex; align-items: center; margin-bottom: 10px;">
                    <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/ndvi/fig/fig1.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
                    <div>
                      <div style="font-weight: bold;">NDVI</div>
                      <div style="font-size: 12px; color: #555;">Normalized Difference Vegetation Index</div>
                    </div>
                  </div>
                  <div id="layer-SAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
                    <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/savi/fig/fig1.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
                    <div style="text-align: center;">
  <div style="font-weight: bold; margin-left: 10px;">SAVI</div>
  <div style="font-size: 12px; color: #555; margin-left: 10px;">Soil-adjusted vegetation index</div>
</div>

                  </div>
                  <div id="layer-MSAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
                    <img src="../../assets/msaviLOGO.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
                    <div>
                      <div style="font-weight: bold;">MSAVI</div>
                      <div style="font-size: 12px; color: #555;">Modified Soil-adjusted vegetation index</div>
                    </div>
                  </div>
                  <div id="layer-MSAVI2" style="display: flex; align-items: center; margin-bottom: 10px;">
                    <img src="../../assets/msavi2LOGO.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
                    <div>
                      <div style="font-weight: bold;">MSAVI2</div>
                      <div style="font-size: 12px; color: #555;">Modified Soil-adjusted vegetation index 2</div>
                    </div>
                  </div>

                  <!-- Add more layers here -->
                </div>
              </div>
            </div>
          </div>`,
          showConfirmButton: false,
          customClass: {
            container: 'custom-swal', // Apply the custom class
          },
          didOpen: () => {
            // Initialize the image map
            const imageMap = L.map(`image-map-${productName}`, {
              center: [0, 0],
              zoom: 1,
              minZoom: 1,
              maxZoom: 8,
              attributionControl: false
            });

            const imageBounds: L.LatLngBoundsLiteral = [[-90, -180], [90, 180]];

            L.imageOverlay(imageUrl, imageBounds).addTo(imageMap);

            imageMap.setMaxBounds(imageBounds);
            imageMap.on('drag', () => {
              imageMap.panInsideBounds(imageBounds);
            });
            L.control.scale({
              position: 'bottomleft', // or 'topright', 'topleft', 'bottomright'
              imperial: false, // Set to true if you want to display imperial units (miles, feet) as well
            }).addTo(imageMap);
            imageMap.setView([0, 0], 1);
            const ndvi = document.getElementById('layer-ndvi');

            if (ndvi) {
              ndvi.addEventListener('click', async () => {
                try {
                  await this.ProcessNDVI(productName);
                  this.showNDVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing NDVI:', error);
                }
              });
            }
            const lai = document.getElementById('layer-lai');

            if (lai) {
              lai.addEventListener('click', async () => {
                try {
                  await this.ProcessLAI(productName);
                  this.showLAIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing LAI:', error);
                }
              });
            }

            const MSAVI = document.getElementById('layer-MSAVI');

            if (MSAVI) {
              MSAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI(productName);
                  this.showMSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI:', error);
                }
              });
            }
            const SAVI = document.getElementById('layer-SAVI');

            if (SAVI) {
              SAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessSAVI(productName);
                  this.showSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing SAVI:', error);
                }
              });
            }
            const MSAVI2 = document.getElementById('layer-MSAVI2');

            if (MSAVI2) {
              MSAVI2.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI2(productName);
                  this.showMSAVI2Image(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI2:', error);
                }
              });
            }



            flatpickr('#date-picker', {
              dateFormat: "Y-m-d",
              defaultDate: new Date(),
              onChange: async (selectedDates) => {
                if (selectedDates.length > 0) {
                  const date = selectedDates[0];

                  // Manually format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
                  const formattedDate = this.formatDateToISO(date);
                  const formattedDatePlusOne = this.formatDateToISO(new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000));

                  console.log("Updated formattedDate:", formattedDate);
                  console.log("Updated formattedDateplus one:", formattedDatePlusOne);

                  try {
                    // Construct the API URL for the first request
                    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Name eq '${productName}'`;

// Make the first API request
                    const response = await fetch(url);
                    if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                    }

// Parse the JSON response
                    const data = await response.json();

// Extract the Footprint
                    const product = data.value[0];
                    if (product && product.Footprint) {
                      const footprint=product.Footprint;
                      const name=product.Name;
                      const nameParts = name.split('_');
                      const nameFirstPart = nameParts.slice(0, 2).join('_');
                      // Clean up the Footprint string by removing spaces after commas
                      const cleanedFootprint = product.Footprint.replace(/,\s+/g, ',');
                      console.log('Cleaned Footprint:', product.Footprint);

                      // Construct the URL for the second request
                      // Encode the Footprint value
                      const secondUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=OData.CSC.Intersects(area=${footprint})%20and%20ContentDate/Start%20gt%20${formattedDate}%20and%20ContentDate/Start%20lt%20${formattedDatePlusOne}%20and%20Collection/Name%20eq%20%27SENTINEL-2%27&$top=1000`;

// Make the second API request
                      const secondResponse = await fetch(secondUrl);
                      if (!secondResponse.ok) {
                        throw new Error(`HTTP error! Status: ${secondResponse.status}`);
                      }

// Parse the JSON response from the second request
                      const secondData = await secondResponse.json();

// Find the first product with the matching footprint


                      const findClosestProduct = (footprint: string, products: any[], nameFirstPart: string): any | null => {
                        // Helper function to extract coordinates from the footprint string
                        const extractCoordinates = (footprint: string): number[] => {
                          return footprint.match(/-?\d+(\.\d+)?/g)?.map((coord: string) => parseFloat(coord)) || [];
                        };

                        // Extract coordinates from the given footprint
                        const footprintCoords = extractCoordinates(footprint);

                        if (footprintCoords.length === 0) {
                          return null;
                        }

                        // Find the product with the closest footprint and matching name
                        let closestProduct = null;
                        let smallestDifference = Infinity;

                        for (const product of products) {
                          // Check if the product name includes the specified part
                          if (!product.Name.includes(nameFirstPart)) {
                            continue;
                          }

                          const productCoords = extractCoordinates(product.Footprint);

                          if (footprintCoords.length !== productCoords.length) {
                            continue;
                          }

                          // Calculate the total difference between coordinates
                          const totalDifference = footprintCoords.reduce((acc, coord, index) => {
                            return acc + Math.abs(coord - productCoords[index]);
                          }, 0);

                          // Update closest product if this one is closer
                          if (totalDifference < smallestDifference) {
                            smallestDifference = totalDifference;
                            closestProduct = product;
                          }
                        }

                        return closestProduct;
                      };

// Example usage
                      const closestProduct = findClosestProduct(footprint, secondData.value, nameFirstPart);

                      if (closestProduct) {
                        console.log(secondUrl)

                        console.log('Closest product found:', closestProduct);
                      } else {
                        console.log(secondUrl)
                        console.log('No matching product found');
                      }


                      if (closestProduct) {
                        if (closestProduct.Name && closestProduct.Id) {
                          const scondeProductName = closestProduct.Name;
                          const scondeProductId = closestProduct.Id;
                          const url = `${this.ip_display}/${scondeProductName}.png`;

                          // Check if the image exists
                          fetch(url, { method: 'HEAD' })
                            .then(response => {
                              if (response.ok) {
                                console.log('exists');
                                Swal.fire({
                                  width: '600px',
                                  html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                  didOpen: () => {
                                    // Inject jQuery and custom scripts
                                    const script = document.createElement('script');
                                    script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                    document.body.appendChild(script);

                                    script.onload = () => {
                                      const script2 = document.createElement('script');
                                      script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                      document.body.appendChild(script2);
                                    };
                                  }
                                });
                                // If the image exists, you might want to proceed with the Swal.fire or any other action
                              } else {
                                // If the image doesn't exist, download and process it
                                this.downloadAndProcess(scondeProductId, scondeProductName)
                                  .then(() => {
                                    Swal.fire({
                                      width: '600px',
                                      html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                      didOpen: () => {
                                        // Inject jQuery and custom scripts
                                        const script = document.createElement('script');
                                        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                        document.body.appendChild(script);

                                        script.onload = () => {
                                          const script2 = document.createElement('script');
                                          script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                          document.body.appendChild(script2);
                                        };
                                      }
                                    });
                                  })
                                  .catch((error) => {
                                    console.error('Error during downloadAndProcess:', error);
                                  });
                              }
                            })
                            .catch(error => {
                              console.error('Error checking URL:', error);
                            });
                        } else {
                          console.error('Product name or ID not available');
                        }
                      } else {
                        console.error('No products found');
                      }



                    }
                  } catch (error) {
                    console.error('Error fetching footprint or products:', error);
                  }
                }
              }
            });

          },
          didClose: () => {
            // Cleanup flatpickr instance when modal closes
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
              flatpickr(datePicker).destroy();
            }
          }
        });
      },
      error: (err) => {
        // If the image does not exist, log an error to the console
        this.downloadAndProcess(productId, productName).then(() => {
          this.showImage(productName, productId);
        }).catch((error) => {
          console.error("An error occurred while processing:", error);
        });
      }
    });
  }
  async showLAIImage(productName: string, productId: string): Promise<void> {
  }


  async showNDVIImage(productName: string, productId: string): Promise<void> {
    const imageUrl = `${this.ip_display}/NDVI/${productName}.png`;

    this.http.head(imageUrl).subscribe({
      next: () => {
        // If the image exists, show the SweetAlert modal
        Swal.fire({
          width: '1000px', // Adjust width to fit both image and calendar
          title: `Image - ID: ${productName}`,
          html: `
          <div style="display: flex; align-items: center;">
  <!-- Image Map -->
  <div id="image-map-${productName}" style="height: 510px; width: 510px; margin-bottom: 250px;"></div>

  <!-- Container for Layer Content and Vertical Bar -->
  <div style="display: flex; align-items: flex-start; margin-left: 20px;">
    <!-- Vertical Bar Image -->
    <img src="../../assets/ndvi%20layer.png" alt="Vertical Bar" style="height: 400px; width: 40px; margin-right: 20px;">

    <!-- Layer Container -->
    <div style="margin-bottom: 450px;">
      <input type="text" id="date-picker" style="width: 200px;" />
      <div style="margin-top: 20px; border: 1px solid #ddd; width: 250px;">
        <div style="background-color: #007bff; color: #fff; padding: 10px; font-weight: bold;">LAYERS:</div>
        <div style="padding: 10px; border-top: 1px solid #ddd;">
          <div id="layer-tci" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/l2a_optimized/fig/fig1.png" alt="tci" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">TCI</div>
              <div style="font-size: 12px; color: #555;">True Colors Index</div>
            </div>
          </div>
                   <div id="layer-SAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/savi/fig/fig1.png" alt="SAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">SAVI</div>
              <div style="font-size: 12px; color: #555;">Soil-adjusted Vegetation Index</div>
            </div>
          </div>

          <div id="layer-MSAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msaviLOGO.png" alt="MSAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index</div>
            </div>
          </div>
          <div id="layer-MSAVI2" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msavi2LOGO.png" alt="MSAVI2" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI2</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index 2</div>
            </div>
          </div>
          <!-- Add more layers here -->
        </div>
      </div>
    </div>
  </div>
</div>
`,
          showConfirmButton: false,
          customClass: {
            container: 'custom-swal', // Apply the custom class
          },
          didOpen: () => {
            // Initialize the image map
            const imageMap = L.map(`image-map-${productName}`, {
              center: [0, 0],
              zoom: 1,
              minZoom: 1,
              maxZoom: 8,
              attributionControl: false
            });
            console.log(imageUrl)
            const imageBounds: L.LatLngBoundsLiteral = [[-90, -180], [90, 180]];
            L.control.scale({
              position: 'bottomleft', // or 'topright', 'topleft', 'bottomright'
              imperial: false, // Set to true if you want to display imperial units (miles, feet) as well
            }).addTo(imageMap);
            L.imageOverlay(imageUrl, imageBounds).addTo(imageMap);

            imageMap.setMaxBounds(imageBounds);
            imageMap.on('drag', () => {
              imageMap.panInsideBounds(imageBounds);
            });

            imageMap.setView([0, 0], 1);
            const ndvi = document.getElementById('layer-ndvi');

            if (ndvi) {
              ndvi.addEventListener('click', async () => {
                try {
                  await this.ProcessNDVI(productName);
                  this.showNDVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing NDVI:', error);
                }
              });
            }

            const lai = document.getElementById('layer-lai');

            if (lai) {
              lai.addEventListener('click', async () => {
                try {
                  await this.ProcessLAI(productName);
                  this.showLAIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing LAI:', error);
                }
              });
            }

            const MSAVI = document.getElementById('layer-MSAVI');

            if (MSAVI) {
              MSAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI(productName);
                  this.showMSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI:', error);
                }
              });
            }
            const tci = document.getElementById('layer-tci');

            if (tci) {
              tci.addEventListener('click', async () => {
                try {
                  await this.ProcessTCI(productName);
                  this.showImage(productName, productId);
                } catch (error) {
                  console.error('Error processing tci:', error);
                }
              });
            }
            const MSAVI2 = document.getElementById('layer-MSAVI2');

            if (MSAVI2) {
              MSAVI2.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI2(productName);
                  this.showMSAVI2Image(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI2:', error);
                }
              });
            }

            flatpickr('#date-picker', {
              dateFormat: "Y-m-d",
              defaultDate: new Date(),
              onChange: async (selectedDates) => {
                if (selectedDates.length > 0) {
                  const date = selectedDates[0];

                  // Manually format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
                  const formattedDate = this.formatDateToISO(date);
                  const formattedDatePlusOne = this.formatDateToISO(new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000));

                  console.log("Updated formattedDate:", formattedDate);
                  console.log("Updated formattedDateplus one:", formattedDatePlusOne);

                  try {
                    // Construct the API URL for the first request
                    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Name eq '${productName}'`;

// Make the first API request
                    const response = await fetch(url);
                    if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                    }

// Parse the JSON response
                    const data = await response.json();

// Extract the Footprint
                    const product = data.value[0];
                    if (product && product.Footprint) {
                      const footprint=product.Footprint;
                      const name=product.Name;
                      const nameParts = name.split('_');
                      const nameFirstPart = nameParts.slice(0, 2).join('_');
                      // Clean up the Footprint string by removing spaces after commas
                      const cleanedFootprint = product.Footprint.replace(/,\s+/g, ',');
                      console.log('Cleaned Footprint:', product.Footprint);

                      // Construct the URL for the second request
                      // Encode the Footprint value
                      const secondUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=OData.CSC.Intersects(area=${footprint})%20and%20ContentDate/Start%20gt%20${formattedDate}%20and%20ContentDate/Start%20lt%20${formattedDatePlusOne}%20and%20Collection/Name%20eq%20%27SENTINEL-2%27&$top=1000`;

// Make the second API request
                      const secondResponse = await fetch(secondUrl);
                      if (!secondResponse.ok) {
                        throw new Error(`HTTP error! Status: ${secondResponse.status}`);
                      }

// Parse the JSON response from the second request
                      const secondData = await secondResponse.json();

// Find the first product with the matching footprint
                      const findClosestProduct = (footprint: string, products: any[], nameFirstPart: string): any | null => {
                        // Helper function to extract coordinates from the footprint string
                        const extractCoordinates = (footprint: string): number[] => {
                          return footprint.match(/-?\d+(\.\d+)?/g)?.map((coord: string) => parseFloat(coord)) || [];
                        };

                        // Extract coordinates from the given footprint
                        const footprintCoords = extractCoordinates(footprint);

                        if (footprintCoords.length === 0) {
                          return null;
                        }

                        // Find the product with the closest footprint and matching name
                        let closestProduct = null;
                        let smallestDifference = Infinity;

                        for (const product of products) {
                          // Check if the product name includes the specified part
                          if (!product.Name.includes(nameFirstPart)) {
                            continue;
                          }

                          const productCoords = extractCoordinates(product.Footprint);

                          if (footprintCoords.length !== productCoords.length) {
                            continue;
                          }

                          // Calculate the total difference between coordinates
                          const totalDifference = footprintCoords.reduce((acc, coord, index) => {
                            return acc + Math.abs(coord - productCoords[index]);
                          }, 0);

                          // Update closest product if this one is closer
                          if (totalDifference < smallestDifference) {
                            smallestDifference = totalDifference;
                            closestProduct = product;
                          }
                        }

                        return closestProduct;
                      };

// Example usage
                      const closestProduct = findClosestProduct(footprint, secondData.value, nameFirstPart);

                      if (closestProduct) {
                        if (closestProduct.Name && closestProduct.Id) {
                          const scondeProductName = closestProduct.Name;
                          const scondeProductId = closestProduct.Id;
                          const url = `${this.ip_display}/${scondeProductName}.png`;

                          // Check if the image exists
                          fetch(url, { method: 'HEAD' })
                            .then(response => {
                              if (response.ok) {
                                console.log('exists');
                                this.showSwalAfterNDVI(scondeProductName,name)
                                // If the image exists, you might want to proceed with the Swal.fire or any other action
                              } else {
                                // If the image doesn't exist, download and process it
                                this.downloadAndProcessNDVI(scondeProductId, scondeProductName)
                                  .then(() => {
                                    Swal.fire({
                                      width: '600px',
                                      html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/NDVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/NDVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                      didOpen: () => {
                                        // Inject jQuery and custom scripts
                                        const script = document.createElement('script');
                                        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                        document.body.appendChild(script);

                                        script.onload = () => {
                                          const script2 = document.createElement('script');
                                          script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                          document.body.appendChild(script2);
                                        };
                                      }
                                    });
                                  })
                                  .catch((error) => {
                                    console.error('Error during downloadAndProcess:', error);
                                  });
                              }
                            }
                            )
                            .catch(error => {
                              console.error('Error checking URL:', error);
                            });
                        } else {
                          console.error('Product name or ID not available');
                        }
                      } else {
                        console.error('No products found');
                      }
                    }
                  } catch (error) {
                    console.error('Error fetching footprint or products:', error);
                  }
                }
              }
            });

          },
          didClose: () => {
            // Cleanup flatpickr instance when modal closes
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
              flatpickr(datePicker).destroy();
            }
          }
        });
      },
      error: (err) => {
        console.error("An error occurred while processing:", err);

      }
    });
  }

  async showSAVIImage(productName: string, productId: string): Promise<void> {
    const imageUrl = `${this.ip_display}/SAVI/${productName}.png`;

    this.http.head(imageUrl).subscribe({
      next: () => {
        // If the image exists, show the SweetAlert modal
        Swal.fire({
          width: '1000px', // Adjust width to fit both image and calendar
          title: `Image - ID: ${productName}`,
          html: `
          <div style="display: flex; align-items: center;">
  <!-- Image Map -->
  <div id="image-map-${productName}" style="height: 510px; width: 510px; margin-bottom: 250px;"></div>

  <!-- Container for Layer Content and Vertical Bar -->
  <div style="display: flex; align-items: flex-start; margin-left: 20px;">
    <!-- Vertical Bar Image -->
    <img src="../../assets/msavi%20legend.png" alt="Vertical Bar" style="height: 400px; width: 40px; margin-right: 20px;">

    <!-- Layer Container -->
    <div style="margin-bottom: 450px;">
      <input type="text" id="date-picker" style="width: 200px;" />
      <div style="margin-top: 20px; border: 1px solid #ddd; width: 250px;">
        <div style="background-color: #007bff; color: #fff; padding: 10px; font-weight: bold;">LAYERS:</div>
        <div style="padding: 10px; border-top: 1px solid #ddd;">
          <div id="layer-tci" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/l2a_optimized/fig/fig1.png" alt="tci" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">TCI</div>
              <div style="font-size: 12px; color: #555;">True Colors Index</div>
            </div>
          </div>
          <div id="layer-ndvi" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/ndvi/fig/fig1.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">NDVI</div>
              <div style="font-size: 12px; color: #555;">Normalized Difference Vegetation Index</div>
            </div>
          </div>
          <div id="layer-MSAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msaviLOGO.png" alt="MSAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index</div>
            </div>
          </div>
          <div id="layer-MSAVI2" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msavi2LOGO.png" alt="MSAVI2" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI2</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index 2</div>
            </div>
          </div>
          <!-- Add more layers here -->
        </div>
      </div>
    </div>
  </div>
</div>
`,
          showConfirmButton: false,
          customClass: {
            container: 'custom-swal', // Apply the custom class
          },
          didOpen: () => {
            // Initialize the image map
            const imageMap = L.map(`image-map-${productName}`, {
              center: [0, 0],
              zoom: 1,
              minZoom: 1,
              maxZoom: 8,
              attributionControl: false
            });
            console.log(imageUrl)
            const imageBounds: L.LatLngBoundsLiteral = [[-90, -180], [90, 180]];
            L.control.scale({
              position: 'bottomleft', // or 'topright', 'topleft', 'bottomright'
              imperial: false, // Set to true if you want to display imperial units (miles, feet) as well
            }).addTo(imageMap);
            L.imageOverlay(imageUrl, imageBounds).addTo(imageMap);

            imageMap.setMaxBounds(imageBounds);
            imageMap.on('drag', () => {
              imageMap.panInsideBounds(imageBounds);
            });

            imageMap.setView([0, 0], 1);
            const ndvi = document.getElementById('layer-ndvi');

            if (ndvi) {
              ndvi.addEventListener('click', async () => {
                try {
                  await this.ProcessNDVI(productName);
                  this.showNDVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing NDVI:', error);
                }
              });
            }

            const lai = document.getElementById('layer-lai');

            if (lai) {
              lai.addEventListener('click', async () => {
                try {
                  await this.ProcessLAI(productName);
                  this.showLAIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing LAI:', error);
                }
              });
            }

            const MSAVI = document.getElementById('layer-MSAVI');

            if (MSAVI) {
              MSAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI(productName);
                  this.showMSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI:', error);
                }
              });
            }
            const tci = document.getElementById('layer-tci');

            if (tci) {
              tci.addEventListener('click', async () => {
                try {
                  await this.ProcessTCI(productName);
                  this.showImage(productName, productId);
                } catch (error) {
                  console.error('Error processing tci:', error);
                }
              });
            }
            const MSAVI2 = document.getElementById('layer-MSAVI2');

            if (MSAVI2) {
              MSAVI2.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI2(productName);
                  this.showMSAVI2Image(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI2:', error);
                }
              });
            }

            flatpickr('#date-picker', {
              dateFormat: "Y-m-d",
              defaultDate: new Date(),
              onChange: async (selectedDates) => {
                if (selectedDates.length > 0) {
                  const date = selectedDates[0];

                  // Manually format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
                  const formattedDate = this.formatDateToISO(date);
                  const formattedDatePlusOne = this.formatDateToISO(new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000));

                  console.log("Updated formattedDate:", formattedDate);
                  console.log("Updated formattedDateplus one:", formattedDatePlusOne);

                  try {
                    // Construct the API URL for the first request
                    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Name eq '${productName}'`;

// Make the first API request
                    const response = await fetch(url);
                    if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                    }

// Parse the JSON response
                    const data = await response.json();

// Extract the Footprint
                    const product = data.value[0];
                    if (product && product.Footprint) {
                      const footprint=product.Footprint;
                      const name=product.Name;
                      const nameParts = name.split('_');
                      const nameFirstPart = nameParts.slice(0, 2).join('_');
                      // Clean up the Footprint string by removing spaces after commas
                      const cleanedFootprint = product.Footprint.replace(/,\s+/g, ',');
                      console.log('Cleaned Footprint:', product.Footprint);

                      // Construct the URL for the second request
                      // Encode the Footprint value
                      const secondUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=OData.CSC.Intersects(area=${footprint})%20and%20ContentDate/Start%20gt%20${formattedDate}%20and%20ContentDate/Start%20lt%20${formattedDatePlusOne}%20and%20Collection/Name%20eq%20%27SENTINEL-2%27&$top=1000`;

// Make the second API request
                      const secondResponse = await fetch(secondUrl);
                      if (!secondResponse.ok) {
                        throw new Error(`HTTP error! Status: ${secondResponse.status}`);
                      }

// Parse the JSON response from the second request
                      const secondData = await secondResponse.json();

// Find the first product with the matching footprint
                      const findClosestProduct = (footprint: string, products: any[], nameFirstPart: string): any | null => {
                        // Helper function to extract coordinates from the footprint string
                        const extractCoordinates = (footprint: string): number[] => {
                          return footprint.match(/-?\d+(\.\d+)?/g)?.map((coord: string) => parseFloat(coord)) || [];
                        };

                        // Extract coordinates from the given footprint
                        const footprintCoords = extractCoordinates(footprint);

                        if (footprintCoords.length === 0) {
                          return null;
                        }

                        // Find the product with the closest footprint and matching name
                        let closestProduct = null;
                        let smallestDifference = Infinity;

                        for (const product of products) {
                          // Check if the product name includes the specified part
                          if (!product.Name.includes(nameFirstPart)) {
                            continue;
                          }

                          const productCoords = extractCoordinates(product.Footprint);

                          if (footprintCoords.length !== productCoords.length) {
                            continue;
                          }

                          // Calculate the total difference between coordinates
                          const totalDifference = footprintCoords.reduce((acc, coord, index) => {
                            return acc + Math.abs(coord - productCoords[index]);
                          }, 0);

                          // Update closest product if this one is closer
                          if (totalDifference < smallestDifference) {
                            smallestDifference = totalDifference;
                            closestProduct = product;
                          }
                        }

                        return closestProduct;
                      };

// Example usage
                      const closestProduct = findClosestProduct(footprint, secondData.value, nameFirstPart);

                      if (closestProduct) {
                        if (closestProduct.Name && closestProduct.Id) {
                          const scondeProductName = closestProduct.Name;
                          const scondeProductId = closestProduct.Id;
                          const url = `${this.ip_display}/${scondeProductName}.png`;

                          // Check if the image exists
                          fetch(url, { method: 'HEAD' })
                            .then(response => {
                                if (response.ok) {
                                  console.log('exists');
                                  this.showSwalAfterSAVI(scondeProductName,name)
                                  // If the image exists, you might want to proceed with the Swal.fire or any other action
                                } else {
                                  // If the image doesn't exist, download and process it
                                  this.downloadAndProcessSAVI(scondeProductId, scondeProductName)
                                    .then(() => {
                                      Swal.fire({
                                        width: '600px',
                                        html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/SAVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/SAVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                        didOpen: () => {
                                          // Inject jQuery and custom scripts
                                          const script = document.createElement('script');
                                          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                          document.body.appendChild(script);

                                          script.onload = () => {
                                            const script2 = document.createElement('script');
                                            script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                            document.body.appendChild(script2);
                                          };
                                        }
                                      });
                                    })
                                    .catch((error) => {
                                      console.error('Error during downloadAndProcess:', error);
                                    });
                                }
                              }
                            )
                            .catch(error => {
                              console.error('Error checking URL:', error);
                            });
                        } else {
                          console.error('Product name or ID not available');
                        }
                      } else {
                        console.error('No products found');
                      }
                    }
                  } catch (error) {
                    console.error('Error fetching footprint or products:', error);
                  }
                }
              }
            });

          },
          didClose: () => {
            // Cleanup flatpickr instance when modal closes
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
              flatpickr(datePicker).destroy();
            }
          }
        });
      },
      error: (err) => {
        console.error("An error occurred while processing:", err);

      }
    });
  }
  async showMSAVIImage(productName: string, productId: string): Promise<void> {
    const imageUrl = `${this.ip_display}/MSAVI/${productName}.png`;

    this.http.head(imageUrl).subscribe({
      next: () => {
        // If the image exists, show the SweetAlert modal
        Swal.fire({
          width: '1000px', // Adjust width to fit both image and calendar
          title: `Image - ID: ${productName}`,
          html: `
         <div style="display: flex; align-items: center;">
  <!-- Image Map -->
  <div id="image-map-${productName}" style="height: 510px; width: 510px; margin-bottom: 250px;"></div>

  <!-- Container for Layer Content and Vertical Bar -->
  <div style="display: flex; align-items: flex-start; margin-left: 20px;">
    <!-- Vertical Bar Image -->
    <img src="../../assets/savi%20legend.png" alt="Vertical Bar" style="height: 400px; width: 40px; margin-right: 20px;">

    <!-- Layer Container -->
    <div style="margin-bottom: 450px;">
      <input type="text" id="date-picker" style="width: 200px;" />
      <div style="margin-top: 20px; border: 1px solid #ddd; width: 250px;">
        <div style="background-color: #007bff; color: #fff; padding: 10px; font-weight: bold;">LAYERS:</div>
        <div style="padding: 10px; border-top: 1px solid #ddd;">
          <div id="layer-tci" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/l2a_optimized/fig/fig1.png" alt="tci" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">TCI</div>
              <div style="font-size: 12px; color: #555;">True Colors Index</div>
            </div>
          </div>
          <div id="layer-SAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/savi/fig/fig1.png" alt="SAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">SAVI</div>
              <div style="font-size: 12px; color: #555;">Soil-adjusted Vegetation Index</div>
            </div>
          </div>
          <div id="layer-ndvi" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/ndvi/fig/fig1.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">NDVI</div>
              <div style="font-size: 12px; color: #555;">Normalized Difference Vegetation Index</div>
            </div>
          </div>
          <div id="layer-MSAVI2" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msavi2LOGO.png" alt="MSAVI2" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI2</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index 2</div>
            </div>
          </div>
          <!-- Add more layers here -->
        </div>
      </div>
    </div>
  </div>
</div>
`,
          showConfirmButton: false,
          customClass: {
            container: 'custom-swal', // Apply the custom class
          },
          didOpen: () => {
            // Initialize the image map
            const imageMap = L.map(`image-map-${productName}`, {
              center: [0, 0],
              zoom: 1,
              minZoom: 1,
              maxZoom: 8,
              attributionControl: false
            });
            console.log(imageUrl)
            const imageBounds: L.LatLngBoundsLiteral = [[-90, -180], [90, 180]];
            L.control.scale({
              position: 'bottomleft', // or 'topright', 'topleft', 'bottomright'
              imperial: false, // Set to true if you want to display imperial units (miles, feet) as well
            }).addTo(imageMap);
            L.imageOverlay(imageUrl, imageBounds).addTo(imageMap);

            imageMap.setMaxBounds(imageBounds);
            imageMap.on('drag', () => {
              imageMap.panInsideBounds(imageBounds);
            });

            imageMap.setView([0, 0], 1);


            const lai = document.getElementById('layer-lai');

            if (lai) {
              lai.addEventListener('click', async () => {
                try {
                  await this.ProcessLAI(productName);
                  this.showLAIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing LAI:', error);
                }
              });
            }
            const ndvi = document.getElementById('layer-ndvi');

            if (ndvi) {
              ndvi.addEventListener('click', async () => {
                try {
                  await this.ProcessNDVI(productName);
                  this.showNDVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing NDVI:', error);
                }
              });
            }

            const tci = document.getElementById('layer-MSAVI');

            if (tci) {
              tci.addEventListener('click', async () => {
                try {
                  await this.ProcessTCI(productName);
                  this.showImage(productName, productId);
                } catch (error) {
                  console.error('Error processing tci:', error);
                }
              });
            }
            const SAVI = document.getElementById('layer-SAVI');

            if (SAVI) {
              SAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessSAVI(productName);
                  this.showSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing SAVI:', error);
                }
              });
            }
            const MSAVI2 = document.getElementById('layer-MSAVI2');

            if (MSAVI2) {
              MSAVI2.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI2(productName);
                  this.showMSAVI2Image(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI2:', error);
                }
              });
            }

            flatpickr('#date-picker', {
              dateFormat: "Y-m-d",
              defaultDate: new Date(),
              onChange: async (selectedDates) => {
                if (selectedDates.length > 0) {
                  const date = selectedDates[0];

                  // Manually format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
                  const formattedDate = this.formatDateToISO(date);
                  const formattedDatePlusOne = this.formatDateToISO(new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000));

                  console.log("Updated formattedDate:", formattedDate);
                  console.log("Updated formattedDateplus one:", formattedDatePlusOne);

                  try {
                    // Construct the API URL for the first request
                    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Name eq '${productName}'`;

// Make the first API request
                    const response = await fetch(url);
                    if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                    }

// Parse the JSON response
                    const data = await response.json();

// Extract the Footprint
                    const product = data.value[0];
                    if (product && product.Footprint) {
                      const footprint=product.Footprint;
                      const name=product.Name;
                      const nameParts = name.split('_');
                      const nameFirstPart = nameParts.slice(0, 2).join('_');
                      // Clean up the Footprint string by removing spaces after commas
                      const cleanedFootprint = product.Footprint.replace(/,\s+/g, ',');
                      console.log('Cleaned Footprint:', product.Footprint);

                      // Construct the URL for the second request
                      // Encode the Footprint value
                      const secondUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=OData.CSC.Intersects(area=${footprint})%20and%20ContentDate/Start%20gt%20${formattedDate}%20and%20ContentDate/Start%20lt%20${formattedDatePlusOne}%20and%20Collection/Name%20eq%20%27SENTINEL-2%27&$top=1000`;

// Make the second API request
                      const secondResponse = await fetch(secondUrl);
                      if (!secondResponse.ok) {
                        throw new Error(`HTTP error! Status: ${secondResponse.status}`);
                      }

// Parse the JSON response from the second request
                      const secondData = await secondResponse.json();

// Find the first product with the matching footprint
                      const findClosestProduct = (footprint: string, products: any[], nameFirstPart: string): any | null => {
                        // Helper function to extract coordinates from the footprint string
                        const extractCoordinates = (footprint: string): number[] => {
                          return footprint.match(/-?\d+(\.\d+)?/g)?.map((coord: string) => parseFloat(coord)) || [];
                        };

                        // Extract coordinates from the given footprint
                        const footprintCoords = extractCoordinates(footprint);

                        if (footprintCoords.length === 0) {
                          return null;
                        }

                        // Find the product with the closest footprint and matching name
                        let closestProduct = null;
                        let smallestDifference = Infinity;

                        for (const product of products) {
                          // Check if the product name includes the specified part
                          if (!product.Name.includes(nameFirstPart)) {
                            continue;
                          }

                          const productCoords = extractCoordinates(product.Footprint);

                          if (footprintCoords.length !== productCoords.length) {
                            continue;
                          }

                          // Calculate the total difference between coordinates
                          const totalDifference = footprintCoords.reduce((acc, coord, index) => {
                            return acc + Math.abs(coord - productCoords[index]);
                          }, 0);

                          // Update closest product if this one is closer
                          if (totalDifference < smallestDifference) {
                            smallestDifference = totalDifference;
                            closestProduct = product;
                          }
                        }

                        return closestProduct;
                      };

// Example usage
                      const closestProduct = findClosestProduct(footprint, secondData.value, nameFirstPart);

                      if (closestProduct) {
                        if (closestProduct.Name && closestProduct.Id) {
                          const scondeProductName = closestProduct.Name;
                          const scondeProductId = closestProduct.Id;
                          const url = `${this.ip_display}/${scondeProductName}.png`;

                          // Check if the image exists
                          fetch(url, { method: 'HEAD' })
                            .then(response => {
                                if (response.ok) {
                                  console.log('exists');
                                  this.showSwalAfterMSAVI(scondeProductName,name)
                                  // If the image exists, you might want to proceed with the Swal.fire or any other action
                                } else {
                                  // If the image doesn't exist, download and process it
                                  this.downloadAndProcessMSAVI(scondeProductId, scondeProductName)
                                    .then(() => {
                                      Swal.fire({
                                        width: '600px',
                                        html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/MSAVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/MSAVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                        didOpen: () => {
                                          // Inject jQuery and custom scripts
                                          const script = document.createElement('script');
                                          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                          document.body.appendChild(script);

                                          script.onload = () => {
                                            const script2 = document.createElement('script');
                                            script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                            document.body.appendChild(script2);
                                          };
                                        }
                                      });
                                    })
                                    .catch((error) => {
                                      console.error('Error during downloadAndProcess:', error);
                                    });
                                }
                              }
                            )
                            .catch(error => {
                              console.error('Error checking URL:', error);
                            });
                        } else {
                          console.error('Product name or ID not available');
                        }
                      } else {
                        console.error('No products found');
                      }

                    }
                  } catch (error) {
                    console.error('Error fetching footprint or products:', error);
                  }
                }
              }
            });

          },
          didClose: () => {
            // Cleanup flatpickr instance when modal closes
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
              flatpickr(datePicker).destroy();
            }
          }
        });
      },
      error: (err) => {
        console.error("An error occurred while processing:", err);

      }
    });
  }
  async showMSAVI2Image(productName: string, productId: string): Promise<void> {
    const imageUrl = `${this.ip_display}/MSAVI2/${productName}.png`;

    this.http.head(imageUrl).subscribe({
      next: () => {
        // If the image exists, show the SweetAlert modal
        Swal.fire({
          width: '1000px', // Adjust width to fit both image and calendar
          title: `Image - ID: ${productName}`,
          html: `
          <div style="display: flex; align-items: center;">
  <!-- Image Map -->
  <div id="image-map-${productName}" style="height: 510px; width: 510px; margin-bottom: 250px;"></div>

  <!-- Container for Layer Content and Vertical Bar -->
  <div style="display: flex; align-items: flex-start; margin-left: 20px;">
    <!-- Vertical Bar Image -->
    <img src="../../assets/msavi2%20legend.png" alt="Vertical Bar" style="height: 400px; width: 40px; margin-right: 20px;">

    <!-- Layer Container -->
    <div style="margin-bottom: 450px;">
      <input type="text" id="date-picker" style="width: 200px;" />
      <div style="margin-top: 20px; border: 1px solid #ddd; width: 250px;">
        <div style="background-color: #007bff; color: #fff; padding: 10px; font-weight: bold;">LAYERS:</div>
        <div style="padding: 10px; border-top: 1px solid #ddd;">
          <div id="layer-tci" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/l2a_optimized/fig/fig1.png" alt="TCI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">TCI</div>
              <div style="font-size: 12px; color: #555;">True Colors Index</div>
            </div>
          </div>
          <div id="layer-SAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/savi/fig/fig1.png" alt="SAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">SAVI</div>
              <div style="font-size: 12px; color: #555;">Soil-adjusted Vegetation Index</div>
            </div>
          </div>
          <div id="layer-MSAVI" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="../../assets/msaviLOGO.png" alt="MSAVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">MSAVI</div>
              <div style="font-size: 12px; color: #555;">Modified Soil-adjusted Vegetation Index</div>
            </div>
          </div>
          <div id="layer-ndvi" style="display: flex; align-items: center; margin-bottom: 10px;">
            <img src="https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/ndvi/fig/fig1.png" alt="NDVI" style="width: 40px; height: 40px; margin-right: 10px;">
            <div style="text-align: center; flex: 1;">
              <div style="font-weight: bold;">NDVI</div>
              <div style="font-size: 12px; color: #555;">Normalized Difference Vegetation Index</div>
            </div>
          </div>
          <!-- Add more layers here -->
        </div>
      </div>
    </div>
  </div>
</div>
`,
          showConfirmButton: false,
          customClass: {
            container: 'custom-swal', // Apply the custom class
          },
          didOpen: () => {
            // Initialize the image map
            const imageMap = L.map(`image-map-${productName}`, {
              center: [0, 0],
              zoom: 1,
              minZoom: 1,
              maxZoom: 8,
              attributionControl: false
            });
            console.log(imageUrl)
            const imageBounds: L.LatLngBoundsLiteral = [[-90, -180], [90, 180]];
            L.control.scale({
              position: 'bottomleft', // or 'topright', 'topleft', 'bottomright'
              imperial: false, // Set to true if you want to display imperial units (miles, feet) as well
            }).addTo(imageMap);
            L.imageOverlay(imageUrl, imageBounds).addTo(imageMap);

            imageMap.setMaxBounds(imageBounds);
            imageMap.on('drag', () => {
              imageMap.panInsideBounds(imageBounds);
            });

            imageMap.setView([0, 0], 1);

            const lai = document.getElementById('layer-lai');

            if (lai) {
              lai.addEventListener('click', async () => {
                try {
                  await this.ProcessLAI(productName);
                  this.showLAIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing LAI:', error);
                }
              });
            }
            const ndvi = document.getElementById('layer-ndvi');

            if (ndvi) {
              ndvi.addEventListener('click', async () => {
                try {
                  await this.ProcessNDVI(productName);
                  this.showNDVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing NDVI:', error);
                }
              });
            }

            const MSAVI = document.getElementById('layer-MSAVI');

            if (MSAVI) {
              MSAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessMSAVI(productName);
                  this.showMSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI:', error);
                }
              });
            }
            const SAVI = document.getElementById('layer-SAVI');

            if (SAVI) {
              SAVI.addEventListener('click', async () => {
                try {
                  await this.ProcessSAVI(productName);
                  this.showSAVIImage(productName, productId);
                } catch (error) {
                  console.error('Error processing SAVI:', error);
                }
              });
            }
            const tci = document.getElementById('layer-tci');

            if (tci) {
              tci.addEventListener('click', async () => {
                try {
                  await this.ProcessTCI(productName);
                  this.showImage(productName, productId);
                } catch (error) {
                  console.error('Error processing MSAVI2:', error);
                }
              });
            }

            flatpickr('#date-picker', {
              dateFormat: "Y-m-d",
              defaultDate: new Date(),
              onChange: async (selectedDates) => {
                if (selectedDates.length > 0) {
                  const date = selectedDates[0];

                  // Manually format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
                  const formattedDate = this.formatDateToISO(date);
                  const formattedDatePlusOne = this.formatDateToISO(new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000));

                  console.log("Updated formattedDate:", formattedDate);
                  console.log("Updated formattedDateplus one:", formattedDatePlusOne);

                  try {
                    // Construct the API URL for the first request
                    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=Name eq '${productName}'`;

// Make the first API request
                    const response = await fetch(url);
                    if (!response.ok) {
                      throw new Error(`HTTP error! Status: ${response.status}`);
                    }

// Parse the JSON response
                    const data = await response.json();

// Extract the Footprint
                    const product = data.value[0];
                    if (product && product.Footprint) {
                      const footprint=product.Footprint;
                      const name=product.Name;
                      const nameParts = name.split('_');
                      const nameFirstPart = nameParts.slice(0, 2).join('_');
                      // Clean up the Footprint string by removing spaces after commas
                      const cleanedFootprint = product.Footprint.replace(/,\s+/g, ',');
                      console.log('Cleaned Footprint:', product.Footprint);

                      // Construct the URL for the second request
                      // Encode the Footprint value
                      const secondUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=OData.CSC.Intersects(area=${footprint})%20and%20ContentDate/Start%20gt%20${formattedDate}%20and%20ContentDate/Start%20lt%20${formattedDatePlusOne}%20and%20Collection/Name%20eq%20%27SENTINEL-2%27&$top=1000`;

// Make the second API request
                      const secondResponse = await fetch(secondUrl);
                      if (!secondResponse.ok) {
                        throw new Error(`HTTP error! Status: ${secondResponse.status}`);
                      }

// Parse the JSON response from the second request
                      const secondData = await secondResponse.json();

// Find the first product with the matching footprint
                      const findClosestProduct = (footprint: string, products: any[], nameFirstPart: string): any | null => {
                        // Helper function to extract coordinates from the footprint string
                        const extractCoordinates = (footprint: string): number[] => {
                          return footprint.match(/-?\d+(\.\d+)?/g)?.map((coord: string) => parseFloat(coord)) || [];
                        };

                        // Extract coordinates from the given footprint
                        const footprintCoords = extractCoordinates(footprint);

                        if (footprintCoords.length === 0) {
                          return null;
                        }

                        // Find the product with the closest footprint and matching name
                        let closestProduct = null;
                        let smallestDifference = Infinity;

                        for (const product of products) {
                          // Check if the product name includes the specified part
                          if (!product.Name.includes(nameFirstPart)) {
                            continue;
                          }

                          const productCoords = extractCoordinates(product.Footprint);

                          if (footprintCoords.length !== productCoords.length) {
                            continue;
                          }

                          // Calculate the total difference between coordinates
                          const totalDifference = footprintCoords.reduce((acc, coord, index) => {
                            return acc + Math.abs(coord - productCoords[index]);
                          }, 0);

                          // Update closest product if this one is closer
                          if (totalDifference < smallestDifference) {
                            smallestDifference = totalDifference;
                            closestProduct = product;
                          }
                        }

                        return closestProduct;
                      };

// Example usage
                      const closestProduct = findClosestProduct(footprint, secondData.value, nameFirstPart);

                      if (closestProduct) {
                        if (closestProduct.Name && closestProduct.Id) {
                          const scondeProductName = closestProduct.Name;
                          const scondeProductId = closestProduct.Id;
                          const url = `${this.ip_display}/${scondeProductName}.png`;

                          // Check if the image exists
                          fetch(url, { method: 'HEAD' })
                            .then(response => {
                                if (response.ok) {
                                  console.log('exists');
                                  this.showSwalAfterMSAVI2(scondeProductName,name)
                                  // If the image exists, you might want to proceed with the Swal.fire or any other action
                                } else {
                                  // If the image doesn't exist, download and process it
                                  this.downloadAndProcessMSAVI2(scondeProductId, scondeProductName)
                                    .then(() => {
                                      Swal.fire({
                                        width: '600px',
                                        html: `
                                <style>
                                    /* Apply user-select: none to the entire page */
                                    body {
                                        user-select: none;
                                    }
                                </style>
                                <body>
                                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                                        <img id="image1" src="${this.ip_display}/MSAVI2/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                                            <img id="image2" src="${this.ip_display}/MSAVI2/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                                        </div>
                                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                                    </div>
                                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                                        <button id="zoomOut">Zoom Out</button>
                                    </div>
                                </div></body>
                                `,
                                        didOpen: () => {
                                          // Inject jQuery and custom scripts
                                          const script = document.createElement('script');
                                          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                                          document.body.appendChild(script);

                                          script.onload = () => {
                                            const script2 = document.createElement('script');
                                            script2.innerHTML = `
                                        $(document).ready(function() {
                                            let compSlider = $(".comparison-slider");

                                            compSlider.each(function() {
                                                let compSliderWidth = $(this).width() + "px";
                                                $(this).find(".resize img").css({ width: compSliderWidth });
                                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                                            });

                                            $(window).on("resize", function() {
                                                let compSliderWidth = compSlider.width() + "px";
                                                compSlider.find(".resize img").css({ width: compSliderWidth });
                                            });

                                            function drags(dragElement, resizeElement, container) {
                                                let touched = false;

                                                window.addEventListener('touchstart', function() {
                                                    touched = true;
                                                });
                                                window.addEventListener('touchend', function() {
                                                    touched = false;
                                                });

                                                dragElement.on("mousedown touchstart", function(e) {
                                                    dragElement.addClass("draggable");
                                                    resizeElement.addClass("resizable");

                                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                    let dragWidth = dragElement.outerWidth();
                                                    let posX = dragElement.offset().left + dragWidth - startX;
                                                    let containerOffset = container.offset().left;
                                                    let containerWidth = container.outerWidth();
                                                    let minLeft = containerOffset + 10;
                                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                                    $(document).on("mousemove touchmove", function(e) {
                                                        if (!touched) {
                                                            e.preventDefault();
                                                        }

                                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                                        let leftValue = moveX + posX - dragWidth;

                                                        if (leftValue < minLeft) {
                                                            leftValue = minLeft;
                                                        } else if (leftValue > maxLeft) {
                                                            leftValue = maxLeft;
                                                        }

                                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                                        $(".draggable").css("left", widthValue);
                                                        $(".resizable").css("width", widthValue);
                                                    }).on("mouseup touchend touchcancel", function() {
                                                        dragElement.removeClass("draggable");
                                                        resizeElement.removeClass("resizable");
                                                    });

                                                }).on("mouseup touchend touchcancel", function() {
                                                    dragElement.removeClass("draggable");
                                                    resizeElement.removeClass("resizable");
                                                });
                                            }

                                            // Zoom functionality
                                            let scale = 1;
                                            let translateX = 0;
                                            let translateY = 0;

                                            const container = $(".comparison-slider");

                                            function applyTransform() {
                                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                                            }

                                            $("#zoomIn").on("click", function() {
                                                scale += 0.1;
                                                applyTransform();
                                            });

                                            $("#zoomOut").on("click", function() {
                                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                                applyTransform();
                                            });

                                            // Pan functionality
                                            let isDragging = false;
                                            let startX, startY;

                                            function restrictMovement(x, y) {
                                                // Get container dimensions
                                                const containerWidth = container.width();
                                                const containerHeight = container.height();
                                                const imageWidth = $("#image1").width() * scale;
                                                const imageHeight = $("#image1").height() * scale;

                                                // Restrict horizontal movement
                                                if (imageWidth > containerWidth) {
                                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                                } else {
                                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                                }

                                                // Restrict vertical movement
                                                if (imageHeight > containerHeight) {
                                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                                } else {
                                                    y = 0; // Prevent moving vertically if image is smaller than container
                                                }

                                                return { x, y };
                                            }

                                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                                isDragging = true;
                                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                                e.preventDefault();
                                            }).on("mousemove touchmove", function(e) {
                                                if (isDragging) {
                                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                                    translateX += moveX - startX;
                                                    translateY += moveY - startY;

                                                    const restricted = restrictMovement(translateX, translateY);
                                                    translateX = restricted.x;
                                                    translateY = restricted.y;

                                                    applyTransform();
                                                    startX = moveX;
                                                    startY = moveY;
                                                }
                                            }).on("mouseup touchend touchcancel", function() {
                                                isDragging = false;
                                            });
                                        });
                                        `;
                                            document.body.appendChild(script2);
                                          };
                                        }
                                      });
                                    })
                                    .catch((error) => {
                                      console.error('Error during downloadAndProcess:', error);
                                    });
                                }
                              }
                            )
                            .catch(error => {
                              console.error('Error checking URL:', error);
                            });
                        } else {
                          console.error('Product name or ID not available');
                        }
                      } else {
                        console.error('No products found');
                      }
                    }
                  } catch (error) {
                    console.error('Error fetching footprint or products:', error);
                  }
                }
              }
            });

          },
          didClose: () => {
            // Cleanup flatpickr instance when modal closes
            const datePicker = document.getElementById('date-picker');
            if (datePicker) {
              flatpickr(datePicker).destroy();
            }
          }
        });
      },
      error: (err) => {
        console.error("An error occurred while processing:", err);

      }
    });
  }




// Method to update control content
  async  showSwalAfterNDVI(scondeProductName: string, name: string): Promise<void> {
    try {
      // Assuming ProcessNDVI returns a Promise, we await its completion
      await this.ProcessNDVI(scondeProductName);

      console.log('exists');

      // Now show the SweetAlert after the NDVI process is complete
      Swal.fire({
        width: '600px',
        html: `
                <style>
                    /* Apply user-select: none to the entire page */
                    body {
                        user-select: none;
                    }
                </style>
                <body>
                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                        <img id="image1" src="${this.ip_display}/NDVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                            <img id="image2" src="${this.ip_display}/NDVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        </div>
                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                    </div>
                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                        <button id="zoomOut">Zoom Out</button>
                    </div>
                </div></body>
            `,
        didOpen: () => {
          // Inject jQuery and custom scripts
          const script = document.createElement('script');
          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
          document.body.appendChild(script);

          script.onload = () => {
            const script2 = document.createElement('script');
            script2.innerHTML = `
                        $(document).ready(function() {
                            let compSlider = $(".comparison-slider");

                            compSlider.each(function() {
                                let compSliderWidth = $(this).width() + "px";
                                $(this).find(".resize img").css({ width: compSliderWidth });
                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                            });

                            $(window).on("resize", function() {
                                let compSliderWidth = compSlider.width() + "px";
                                compSlider.find(".resize img").css({ width: compSliderWidth });
                            });

                            function drags(dragElement, resizeElement, container) {
                                let touched = false;

                                window.addEventListener('touchstart', function() {
                                    touched = true;
                                });
                                window.addEventListener('touchend', function() {
                                    touched = false;
                                });

                                dragElement.on("mousedown touchstart", function(e) {
                                    dragElement.addClass("draggable");
                                    resizeElement.addClass("resizable");

                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                    let dragWidth = dragElement.outerWidth();
                                    let posX = dragElement.offset().left + dragWidth - startX;
                                    let containerOffset = container.offset().left;
                                    let containerWidth = container.outerWidth();
                                    let minLeft = containerOffset + 10;
                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                    $(document).on("mousemove touchmove", function(e) {
                                        if (!touched) {
                                            e.preventDefault();
                                        }

                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                        let leftValue = moveX + posX - dragWidth;

                                        if (leftValue < minLeft) {
                                            leftValue = minLeft;
                                        } else if (leftValue > maxLeft) {
                                            leftValue = maxLeft;
                                        }

                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                        $(".draggable").css("left", widthValue);
                                        $(".resizable").css("width", widthValue);
                                    }).on("mouseup touchend touchcancel", function() {
                                        dragElement.removeClass("draggable");
                                        resizeElement.removeClass("resizable");
                                    });

                                }).on("mouseup touchend touchcancel", function() {
                                    dragElement.removeClass("draggable");
                                    resizeElement.removeClass("resizable");
                                });
                            }

                            // Zoom functionality
                            let scale = 1;
                            let translateX = 0;
                            let translateY = 0;

                            const container = $(".comparison-slider");

                            function applyTransform() {
                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                            }

                            $("#zoomIn").on("click", function() {
                                scale += 0.1;
                                applyTransform();
                            });

                            $("#zoomOut").on("click", function() {
                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                applyTransform();
                            });

                            // Pan functionality
                            let isDragging = false;
                            let startX, startY;

                            function restrictMovement(x, y) {
                                // Get container dimensions
                                const containerWidth = container.width();
                                const containerHeight = container.height();
                                const imageWidth = $("#image1").width() * scale;
                                const imageHeight = $("#image1").height() * scale;

                                // Restrict horizontal movement
                                if (imageWidth > containerWidth) {
                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                } else {
                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                }

                                // Restrict vertical movement
                                if (imageHeight > containerHeight) {
                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                } else {
                                    y = 0; // Prevent moving vertically if image is smaller than container
                                }

                                return { x, y };
                            }

                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                isDragging = true;
                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                e.preventDefault();
                            }).on("mousemove touchmove", function(e) {
                                if (isDragging) {
                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                    translateX += moveX - startX;
                                    translateY += moveY - startY;

                                    const restricted = restrictMovement(translateX, translateY);
                                    translateX = restricted.x;
                                    translateY = restricted.y;

                                    applyTransform();
                                    startX = moveX;
                                    startY = moveY;
                                }
                            }).on("mouseup touchend touchcancel", function() {
                                isDragging = false;
                            });
                        });
                    `;
            document.body.appendChild(script2);
          };
        }
      });
    } catch (error) {
      console.error('Error during NDVI process:', error);
    }
  }
  async  showSwalAfterMSAVI(scondeProductName: string, name: string): Promise<void> {
    try {
      // Assuming ProcessNDVI returns a Promise, we await its completion
      await this.ProcessMSAVI(scondeProductName);

      console.log('exists');

      // Now show the SweetAlert after the NDVI process is complete
      Swal.fire({
        width: '600px',
        html: `
                <style>
                    /* Apply user-select: none to the entire page */
                    body {
                        user-select: none;
                    }
                </style>
                <body>
                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                        <img id="image1" src="${this.ip_display}/MSAVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                            <img id="image2" src="${this.ip_display}/MSAVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        </div>
                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                    </div>
                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                        <button id="zoomOut">Zoom Out</button>
                    </div>
                </div></body>
            `,
        didOpen: () => {
          // Inject jQuery and custom scripts
          const script = document.createElement('script');
          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
          document.body.appendChild(script);

          script.onload = () => {
            const script2 = document.createElement('script');
            script2.innerHTML = `
                        $(document).ready(function() {
                            let compSlider = $(".comparison-slider");

                            compSlider.each(function() {
                                let compSliderWidth = $(this).width() + "px";
                                $(this).find(".resize img").css({ width: compSliderWidth });
                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                            });

                            $(window).on("resize", function() {
                                let compSliderWidth = compSlider.width() + "px";
                                compSlider.find(".resize img").css({ width: compSliderWidth });
                            });

                            function drags(dragElement, resizeElement, container) {
                                let touched = false;

                                window.addEventListener('touchstart', function() {
                                    touched = true;
                                });
                                window.addEventListener('touchend', function() {
                                    touched = false;
                                });

                                dragElement.on("mousedown touchstart", function(e) {
                                    dragElement.addClass("draggable");
                                    resizeElement.addClass("resizable");

                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                    let dragWidth = dragElement.outerWidth();
                                    let posX = dragElement.offset().left + dragWidth - startX;
                                    let containerOffset = container.offset().left;
                                    let containerWidth = container.outerWidth();
                                    let minLeft = containerOffset + 10;
                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                    $(document).on("mousemove touchmove", function(e) {
                                        if (!touched) {
                                            e.preventDefault();
                                        }

                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                        let leftValue = moveX + posX - dragWidth;

                                        if (leftValue < minLeft) {
                                            leftValue = minLeft;
                                        } else if (leftValue > maxLeft) {
                                            leftValue = maxLeft;
                                        }

                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                        $(".draggable").css("left", widthValue);
                                        $(".resizable").css("width", widthValue);
                                    }).on("mouseup touchend touchcancel", function() {
                                        dragElement.removeClass("draggable");
                                        resizeElement.removeClass("resizable");
                                    });

                                }).on("mouseup touchend touchcancel", function() {
                                    dragElement.removeClass("draggable");
                                    resizeElement.removeClass("resizable");
                                });
                            }

                            // Zoom functionality
                            let scale = 1;
                            let translateX = 0;
                            let translateY = 0;

                            const container = $(".comparison-slider");

                            function applyTransform() {
                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                            }

                            $("#zoomIn").on("click", function() {
                                scale += 0.1;
                                applyTransform();
                            });

                            $("#zoomOut").on("click", function() {
                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                applyTransform();
                            });

                            // Pan functionality
                            let isDragging = false;
                            let startX, startY;

                            function restrictMovement(x, y) {
                                // Get container dimensions
                                const containerWidth = container.width();
                                const containerHeight = container.height();
                                const imageWidth = $("#image1").width() * scale;
                                const imageHeight = $("#image1").height() * scale;

                                // Restrict horizontal movement
                                if (imageWidth > containerWidth) {
                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                } else {
                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                }

                                // Restrict vertical movement
                                if (imageHeight > containerHeight) {
                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                } else {
                                    y = 0; // Prevent moving vertically if image is smaller than container
                                }

                                return { x, y };
                            }

                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                isDragging = true;
                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                e.preventDefault();
                            }).on("mousemove touchmove", function(e) {
                                if (isDragging) {
                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                    translateX += moveX - startX;
                                    translateY += moveY - startY;

                                    const restricted = restrictMovement(translateX, translateY);
                                    translateX = restricted.x;
                                    translateY = restricted.y;

                                    applyTransform();
                                    startX = moveX;
                                    startY = moveY;
                                }
                            }).on("mouseup touchend touchcancel", function() {
                                isDragging = false;
                            });
                        });
                    `;
            document.body.appendChild(script2);
          };
        }
      });
    } catch (error) {
      console.error('Error during NDVI process:', error);
    }
  }
  async  showSwalAfterMSAVI2(scondeProductName: string, name: string): Promise<void> {
    try {
      // Assuming ProcessNDVI returns a Promise, we await its completion
      await this.ProcessMSAVI2(scondeProductName);

      console.log('exists');

      // Now show the SweetAlert after the NDVI process is complete
      Swal.fire({
        width: '600px',
        html: `
                <style>
                    /* Apply user-select: none to the entire page */
                    body {
                        user-select: none;
                    }
                </style>
                <body>
                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                        <img id="image1" src="${this.ip_display}/MSAVI2/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                            <img id="image2" src="${this.ip_display}/MSAVI2/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        </div>
                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                    </div>
                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                        <button id="zoomIn" style="margin-bottom: 5px;">
  <i class="fas fa-search-plus"></i>
</button>
<button id="zoomOut">
  <i class="fas fa-search-minus"></i>
</button>

                    </div>
                </div></body>
            `,
        didOpen: () => {
          // Inject jQuery and custom scripts
          const script = document.createElement('script');
          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
          document.body.appendChild(script);

          script.onload = () => {
            const script2 = document.createElement('script');
            script2.innerHTML = `
                        $(document).ready(function() {
                            let compSlider = $(".comparison-slider");

                            compSlider.each(function() {
                                let compSliderWidth = $(this).width() + "px";
                                $(this).find(".resize img").css({ width: compSliderWidth });
                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                            });

                            $(window).on("resize", function() {
                                let compSliderWidth = compSlider.width() + "px";
                                compSlider.find(".resize img").css({ width: compSliderWidth });
                            });

                            function drags(dragElement, resizeElement, container) {
                                let touched = false;

                                window.addEventListener('touchstart', function() {
                                    touched = true;
                                });
                                window.addEventListener('touchend', function() {
                                    touched = false;
                                });

                                dragElement.on("mousedown touchstart", function(e) {
                                    dragElement.addClass("draggable");
                                    resizeElement.addClass("resizable");

                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                    let dragWidth = dragElement.outerWidth();
                                    let posX = dragElement.offset().left + dragWidth - startX;
                                    let containerOffset = container.offset().left;
                                    let containerWidth = container.outerWidth();
                                    let minLeft = containerOffset + 10;
                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                    $(document).on("mousemove touchmove", function(e) {
                                        if (!touched) {
                                            e.preventDefault();
                                        }

                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                        let leftValue = moveX + posX - dragWidth;

                                        if (leftValue < minLeft) {
                                            leftValue = minLeft;
                                        } else if (leftValue > maxLeft) {
                                            leftValue = maxLeft;
                                        }

                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                        $(".draggable").css("left", widthValue);
                                        $(".resizable").css("width", widthValue);
                                    }).on("mouseup touchend touchcancel", function() {
                                        dragElement.removeClass("draggable");
                                        resizeElement.removeClass("resizable");
                                    });

                                }).on("mouseup touchend touchcancel", function() {
                                    dragElement.removeClass("draggable");
                                    resizeElement.removeClass("resizable");
                                });
                            }

                            // Zoom functionality
                            let scale = 1;
                            let translateX = 0;
                            let translateY = 0;

                            const container = $(".comparison-slider");

                            function applyTransform() {
                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                            }

                            $("#zoomIn").on("click", function() {
                                scale += 0.1;
                                applyTransform();
                            });

                            $("#zoomOut").on("click", function() {
                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                applyTransform();
                            });

                            // Pan functionality
                            let isDragging = false;
                            let startX, startY;

                            function restrictMovement(x, y) {
                                // Get container dimensions
                                const containerWidth = container.width();
                                const containerHeight = container.height();
                                const imageWidth = $("#image1").width() * scale;
                                const imageHeight = $("#image1").height() * scale;

                                // Restrict horizontal movement
                                if (imageWidth > containerWidth) {
                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                } else {
                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                }

                                // Restrict vertical movement
                                if (imageHeight > containerHeight) {
                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                } else {
                                    y = 0; // Prevent moving vertically if image is smaller than container
                                }

                                return { x, y };
                            }

                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                isDragging = true;
                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                e.preventDefault();
                            }).on("mousemove touchmove", function(e) {
                                if (isDragging) {
                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                    translateX += moveX - startX;
                                    translateY += moveY - startY;

                                    const restricted = restrictMovement(translateX, translateY);
                                    translateX = restricted.x;
                                    translateY = restricted.y;

                                    applyTransform();
                                    startX = moveX;
                                    startY = moveY;
                                }
                            }).on("mouseup touchend touchcancel", function() {
                                isDragging = false;
                            });
                        });
                    `;
            document.body.appendChild(script2);
          };
        }
      });
    } catch (error) {
      console.error('Error during NDVI process:', error);
    }
  }
  async  showSwalAfterSAVI(scondeProductName: string, name: string): Promise<void> {
    try {
      // Assuming ProcessNDVI returns a Promise, we await its completion
      await this.ProcessSAVI(scondeProductName);

      console.log('exists');

      // Now show the SweetAlert after the NDVI process is complete
      Swal.fire({
        width: '600px',
        html: `
                <style>
                    /* Apply user-select: none to the entire page */
                    body {
                        user-select: none;
                    }
                </style>
                <body>
                <div class="comparison-slider-container" style="position: relative; width: 500px; height: 500px; margin: 0 auto;">
                    <div class="comparison-slider" style="position: relative; width: 100%; height: 100%; overflow: hidden; border: 1px solid #ccc; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                        <img id="image1" src="${this.ip_display}/SAVI/${name}.png" alt="Image 1" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        <div class="resize" style="position: absolute; top: 0; left: 0; width: 50%; height: 100%; overflow: hidden; transition: width 0.3s ease;">
                            <img id="image2" src="${this.ip_display}/SAVI/${scondeProductName}.png" alt="Image 2" style="width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 0 0;">
                        </div>
                        <div class="divider" style="position: absolute; width: 2px; height: 100%; background-color: rgba(255, 255, 255, 0.2); left: 50%; top: 0; cursor: ew-resize; transition: left 0.3s ease;"></div>
                    </div>
                    <div class="zoom-controls" style="position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; z-index: 10;">
                        <button id="zoomIn" style="margin-bottom: 5px;">Zoom In</button>
                        <button id="zoomOut">Zoom Out</button>
                    </div>
                </div></body>
            `,
        didOpen: () => {
          // Inject jQuery and custom scripts
          const script = document.createElement('script');
          script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
          document.body.appendChild(script);

          script.onload = () => {
            const script2 = document.createElement('script');
            script2.innerHTML = `
                        $(document).ready(function() {
                            let compSlider = $(".comparison-slider");

                            compSlider.each(function() {
                                let compSliderWidth = $(this).width() + "px";
                                $(this).find(".resize img").css({ width: compSliderWidth });
                                drags($(this).find(".divider"), $(this).find(".resize"), $(this));
                            });

                            $(window).on("resize", function() {
                                let compSliderWidth = compSlider.width() + "px";
                                compSlider.find(".resize img").css({ width: compSliderWidth });
                            });

                            function drags(dragElement, resizeElement, container) {
                                let touched = false;

                                window.addEventListener('touchstart', function() {
                                    touched = true;
                                });
                                window.addEventListener('touchend', function() {
                                    touched = false;
                                });

                                dragElement.on("mousedown touchstart", function(e) {
                                    dragElement.addClass("draggable");
                                    resizeElement.addClass("resizable");

                                    let startX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                    let dragWidth = dragElement.outerWidth();
                                    let posX = dragElement.offset().left + dragWidth - startX;
                                    let containerOffset = container.offset().left;
                                    let containerWidth = container.outerWidth();
                                    let minLeft = containerOffset + 10;
                                    let maxLeft = containerOffset + containerWidth - dragWidth - 10;

                                    $(document).on("mousemove touchmove", function(e) {
                                        if (!touched) {
                                            e.preventDefault();
                                        }

                                        let moveX = e.pageX ? e.pageX : e.originalEvent.touches[0].pageX;
                                        let leftValue = moveX + posX - dragWidth;

                                        if (leftValue < minLeft) {
                                            leftValue = minLeft;
                                        } else if (leftValue > maxLeft) {
                                            leftValue = maxLeft;
                                        }

                                        let widthValue = (leftValue + dragWidth / 2 - containerOffset) * 100 / containerWidth + "%";
                                        $(".draggable").css("left", widthValue);
                                        $(".resizable").css("width", widthValue);
                                    }).on("mouseup touchend touchcancel", function() {
                                        dragElement.removeClass("draggable");
                                        resizeElement.removeClass("resizable");
                                    });

                                }).on("mouseup touchend touchcancel", function() {
                                    dragElement.removeClass("draggable");
                                    resizeElement.removeClass("resizable");
                                });
                            }

                            // Zoom functionality
                            let scale = 1;
                            let translateX = 0;
                            let translateY = 0;

                            const container = $(".comparison-slider");

                            function applyTransform() {
                                $("#image1, #image2").css("transform", "scale(" + scale + ") translate(" + translateX + "px, " + translateY + "px)");
                            }

                            $("#zoomIn").on("click", function() {
                                scale += 0.1;
                                applyTransform();
                            });

                            $("#zoomOut").on("click", function() {
                                scale = Math.max(0.1, scale - 0.1); // Ensure scale doesn't go below 0.1
                                applyTransform();
                            });

                            // Pan functionality
                            let isDragging = false;
                            let startX, startY;

                            function restrictMovement(x, y) {
                                // Get container dimensions
                                const containerWidth = container.width();
                                const containerHeight = container.height();
                                const imageWidth = $("#image1").width() * scale;
                                const imageHeight = $("#image1").height() * scale;

                                // Restrict horizontal movement
                                if (imageWidth > containerWidth) {
                                    x = Math.min(0, Math.max(x, containerWidth - imageWidth));
                                } else {
                                    x = 0; // Prevent moving horizontally if image is smaller than container
                                }

                                // Restrict vertical movement
                                if (imageHeight > containerHeight) {
                                    y = Math.min(0, Math.max(y, containerHeight - imageHeight));
                                } else {
                                    y = 0; // Prevent moving vertically if image is smaller than container
                                }

                                return { x, y };
                            }

                            $("#image1, #image2").on("mousedown touchstart", function(e) {
                                isDragging = true;
                                startX = e.pageX || e.originalEvent.touches[0].pageX;
                                startY = e.pageY || e.originalEvent.touches[0].pageY;
                                e.preventDefault();
                            }).on("mousemove touchmove", function(e) {
                                if (isDragging) {
                                    let moveX = e.pageX || e.originalEvent.touches[0].pageX;
                                    let moveY = e.pageY || e.originalEvent.touches[0].pageY;
                                    translateX += moveX - startX;
                                    translateY += moveY - startY;

                                    const restricted = restrictMovement(translateX, translateY);
                                    translateX = restricted.x;
                                    translateY = restricted.y;

                                    applyTransform();
                                    startX = moveX;
                                    startY = moveY;
                                }
                            }).on("mouseup touchend touchcancel", function() {
                                isDragging = false;
                            });
                        });
                    `;
            document.body.appendChild(script2);
          };
        }
      });
    } catch (error) {
      console.error('Error during NDVI process:', error);
    }
  }
  async fetchDataForDrawnShapes() {
    this.fetchedProductNames = [];
    this.isLoading = true;
    this.productCount = 0;  // Reset product count
    const layers = this.drawnItems.getLayers();

    if (layers.length === 0) {
      console.log('No shapes drawn on the map.');
      this.isLoading = false;
      return;
    }

    const layer = layers[0] as L.Polygon;
    const bbox = layer.getBounds();

    const minLat = bbox.getSouthWest().lat.toFixed(6);
    const minLon = bbox.getSouthWest().lng.toFixed(6);
    const maxLat = bbox.getNorthEast().lat.toFixed(6);
    const maxLon = bbox.getNorthEast().lng.toFixed(6);

    const polygonCoords = `${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}`;

    const startDate = new Date(this.startDate).toISOString();
    const endDate = new Date(this.endDate).toISOString();

    const baseUrl = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products';

    let collectionName = '';
    let productTypeQuery = '';

    if (this.collectionType === '1') {
      // Sentinel-1
      collectionName = 'SENTINEL-1';
      productTypeQuery = ` and ((Attributes/OData.CSC.StringAttribute/any(i0:i0/Name eq 'productType' and i0/Value eq '${this.sentinel1ProductType}')))`;
    } else if (this.collectionType === '2') {
      // Sentinel-2
      collectionName = 'SENTINEL-2';
      productTypeQuery = ` and ((Attributes/OData.CSC.StringAttribute/any(i0:i0/Name eq 'productType' and i0/Value eq '${this.sentinel2ProductType}')))`;
    } else if (this.collectionType === '3') {
      // Sentinel-3
      collectionName = 'SENTINEL-3';
      productTypeQuery = ` and ((Attributes/OData.CSC.StringAttribute/any(i0:i0/Name eq 'productType' and i0/Value eq '${this.sentinel3ProductType}')))`;
    }

    const queryParams = `$filter=((ContentDate/Start ge ${startDate} and ContentDate/Start le ${endDate}) and (Online eq true) and (OData.CSC.Intersects(Footprint=geography'SRID=4326;POLYGON((${polygonCoords}))')) and (((Collection/Name eq '${collectionName}')${productTypeQuery})))&$expand=Attributes&$expand=Assets&$orderby=ContentDate/Start asc&$top=1000`;

    const url = `${baseUrl}?${queryParams}`;

    try {
      await this.fetchAllPages(url);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async fetchAllPages(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error fetching data: ${response.statusText}`);
      }

      const data: ODataResponse = await response.json();

      const products = data.value.map((item: Product): FetchedProduct => {
        const coordsString = item.GeoFootprint?.coordinates[0].flat().join(',') || ''; // Convert coordinates to string
        return {
          id: item.Id,
          name: item.Name,
          contentLength: this.formatBytes(item.ContentLength),
          publish_date: this.formatISODate(item.PublicationDate),
          coordinates: coordsString
        };
      });

      this.fetchedProductNames = [...this.fetchedProductNames, ...products];
      this.productCount += data.value.length;  // Update product count

      if (data["@odata.nextLink"]) {
        await this.fetchAllPages(data["@odata.nextLink"]);
      }
    } catch (error) {
      console.error('Error fetching paginated data:', error);
    }
  }

  onCollectionTypeChange() {
    // Reset product types to default when collection type changes
    if (this.collectionType === '1') {
      this.sentinel1ProductType = 'RAW';
    } else if (this.collectionType === '2') {
      this.sentinel2ProductType = 'S2MSI2A';
    } else if (this.collectionType === '3') {
      this.sentinel3ProductType = 'OL_1_EFR___';
    }
  }
  formatDateToISO(date: Date): string {
    // Create a new Date object in UTC
    const utcDate = new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    ));

    // Format the date to 'YYYY-MM-DDTHH:mm:ss.sssZ'
    return utcDate.toISOString();
  }
  formatISODate(dateString: string): string {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Returns the date in YYYY-MM-DD format
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }


}



