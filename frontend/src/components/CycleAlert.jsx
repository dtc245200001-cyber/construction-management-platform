import React from 'react';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { AlertCircle } from 'lucide-react';

/**
 * Ví dụ sử dụng:
 * 
 * import { CycleAlert, isCycleError } from '@/components/CycleAlert';
 * 
 * function MyComponent() {
 *   const [error, setError] = useState(null);
 * 
 *   const handleSubmit = async () => {
 *     try {
 *       await api.post('/dependencies', ...);
 *     } catch (err) {
 *       if (isCycleError(err)) {
 *         setError(err);
 *       }
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       {error && <CycleAlert error={error} />}
 *     </div>
 *   );
 * }
 */

/**
 * Hàm kiểm tra xem một lỗi có phải là lỗi vòng phụ thuộc hay không
 */
export function isCycleError(err) {
  if (!err) return false;
  // Kiểm tra từ error.cycleData (được set ở api.ts) hoặc trực tiếp từ response.data
  const code = err.cycleData?.code || err.response?.data?.code;
  return code === 'DEPENDENCY_CYCLE' || code === 'EXISTING_CYCLE';
}

/**
 * Component hiển thị thông báo lỗi vòng phụ thuộc
 */
export function CycleAlert({ error }) {
  if (!error) return null;

  const data = error.cycleData || error.response?.data;
  if (!data) return null;

  const { code, cycleSentence, cycleNames } = data;
  const isExisting = code === 'EXISTING_CYCLE';

  return (
    <Alert variant="destructive" className="my-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Phát hiện vòng phụ thuộc</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col gap-2">
        <p className="font-medium">{cycleSentence}</p>
        
        {cycleNames && cycleNames.length > 0 && (
          <div className="bg-destructive/10 rounded p-3 text-sm mt-1 overflow-x-auto">
            <ol className="list-decimal pl-5 space-y-1">
              {cycleNames.map((name, idx) => (
                <li key={idx} className="whitespace-nowrap">
                  {name}
                </li>
              ))}
            </ol>
          </div>
        )}
        
        {isExisting && (
          <p className="text-sm font-semibold mt-1">
            Hãy xoá hoặc sửa một quan hệ trong chuỗi này trước khi thao tác tiếp.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default CycleAlert;
